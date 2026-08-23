import { randomBytes, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import net from 'node:net'
import { networkInterfaces } from 'node:os'
import type { WebContents } from 'electron'
import type { LowCodeProject } from '../../src/types/lowcode'
import type {
  CollaborationCreateInput,
  CollaborationEvent,
  CollaborationJoinInput,
  CollaborationParticipant,
  CollaborationSession,
} from '../../src/types/collaboration'

const MAX_MESSAGE_BYTES = 12 * 1024 * 1024
const HANDSHAKE_TIMEOUT_MS = 8_000

interface HostConnection {
  id: string
  socket: net.Socket
  participant: CollaborationParticipant
  buffer: string
}

interface HostSession {
  session: CollaborationSession
  ownerWebContentsId: number
  windows: Set<number>
  connections: Map<string, HostConnection>
  project: LowCodeProject
  server?: net.Server
}

interface RemoteConnection {
  socket: net.Socket
  session: CollaborationSession
  buffer: string
  resolveJoin?: (session: CollaborationSession) => void
  rejectJoin?: (reason: Error) => void
}

type WireMessage =
  | { type: 'join'; sessionId: string; token: string; projectId: string; participantId: string; displayName?: string }
  | { type: 'publish'; project: LowCodeProject }
  | { type: 'leave' }
  | { type: 'joined'; session: CollaborationSession }
  | { type: 'event'; event: CollaborationEvent }
  | { type: 'error'; message: string }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
}

function token() {
  return randomBytes(12).toString('base64url')
}

function sendSocket(socket: net.Socket, message: WireMessage) {
  if (socket.destroyed) return
  const payload = JSON.stringify(message)
  if (Buffer.byteLength(payload, 'utf8') > MAX_MESSAGE_BYTES) throw new Error('协作消息超过 12 MB，已拒绝发送')
  socket.write(payload + '\n')
}

function localNetworkAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      const family = typeof entry.family === 'string' ? entry.family : entry.family === 4 ? 'IPv4' : ''
      if (!entry.internal && family === 'IPv4' && isIP(entry.address) === 4) return entry.address
    }
  }
  return '127.0.0.1'
}

export class CollaborationHub {
  private readonly hostSessions = new Map<string, HostSession>()
  private readonly localMembership = new Map<number, string>()
  private readonly remoteConnections = new Map<number, RemoteConnection>()

  constructor(private readonly emitToWindow: (webContentsId: number, event: CollaborationEvent) => void) {}

  async createSession(sender: WebContents, input: CollaborationCreateInput) {
    const existingId = this.localMembership.get(sender.id)
    if (existingId) await this.leave(sender)

    const sessionId = makeId('session')
    const participant: CollaborationParticipant = {
      id: `window_${sender.id}`,
      name: input.displayName?.trim() || '本机窗口',
      joinedAt: new Date().toISOString(),
      transport: 'electron',
      host: true,
    }
    const session: CollaborationSession = {
      id: sessionId,
      projectId: input.project.id,
      mode: input.mode,
      role: 'host',
      host: input.mode === 'lan' ? localNetworkAddress() : '本机',
      port: undefined,
      token: token(),
      createdAt: new Date().toISOString(),
      participants: [participant],
    }
    const state: HostSession = {
      session,
      ownerWebContentsId: sender.id,
      windows: new Set([sender.id]),
      connections: new Map(),
      project: clone(input.project),
    }
    this.hostSessions.set(sessionId, state)
    this.localMembership.set(sender.id, sessionId)

    if (input.mode === 'lan') {
      state.server = net.createServer(socket => this.acceptHostConnection(state, socket))
      try {
        await new Promise<void>((resolve, reject) => {
          const onListening = () => {
            state.server?.off('error', onError)
            const address = state.server?.address()
            session.port = typeof address === 'object' && address ? address.port : undefined
            resolve()
          }
          const onError = (error: Error) => {
            state.server?.off('listening', onListening)
            reject(error)
          }
          state.server?.once('error', onError)
          state.server?.once('listening', onListening)
          // Explicit LAN opt-in: only this mode binds beyond loopback.
          state.server?.listen({ host: '0.0.0.0', port: 0 })
        })
      } catch (error) {
        await this.closeHostSession(state)
        throw error
      }
    }

    this.emitSessionState(state)
    return clone(session)
  }

  async joinSession(sender: WebContents, input: CollaborationJoinInput) {
    await this.leave(sender)
    const local = this.hostSessions.get(input.sessionId)
    if (local) {
      if (local.session.token !== input.token) throw new Error('协作口令不正确')
      if (local.session.projectId !== input.projectId) throw new Error('协作项目不匹配')
      const participant: CollaborationParticipant = {
        id: `window_${sender.id}`,
        name: input.displayName?.trim() || '本机窗口',
        joinedAt: new Date().toISOString(),
        transport: 'electron',
        host: false,
      }
      local.windows.add(sender.id)
      local.session.participants = [...local.session.participants.filter(item => item.id !== participant.id), participant]
      this.localMembership.set(sender.id, local.session.id)
      this.emitSessionState(local)
      this.emitToWindow(sender.id, { type: 'project-update', project: clone(local.project), originId: 'host', updatedAt: local.project.updatedAt })
      return this.sessionForWindow(local, sender.id)
    }

    const host = input.host?.trim()
    const port = Number(input.port)
    if (!host || !isIP(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('局域网会话地址无效，请填写 IPv4 地址和端口')
    }
    const socket = net.createConnection({ host, port })
    const remote: RemoteConnection = {
      socket,
      session: {
        id: input.sessionId,
        projectId: input.projectId,
        mode: 'lan',
        role: 'guest',
        host,
        port,
        token: input.token,
        createdAt: new Date().toISOString(),
        participants: [],
      },
      buffer: '',
    }
    this.remoteConnections.set(sender.id, remote)
    socket.setNoDelay(true)
    socket.on('data', chunk => this.handleRemoteData(sender.id, chunk.toString('utf8')))
    socket.on('error', error => {
      remote.rejectJoin?.(error)
      this.emitToWindow(sender.id, { type: 'error', message: `局域网协作连接失败：${error.message}` })
    })
    socket.on('close', () => {
      remote.rejectJoin?.(new Error('局域网协作连接已关闭'))
      this.remoteConnections.delete(sender.id)
      this.emitToWindow(sender.id, { type: 'left', reason: '协作主机已关闭连接' })
    })
    const result = await new Promise<CollaborationSession>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('加入局域网协作超时')), HANDSHAKE_TIMEOUT_MS)
      remote.resolveJoin = session => {
        clearTimeout(timer)
        resolve(session)
      }
      remote.rejectJoin = reason => {
        clearTimeout(timer)
        reject(reason)
      }
      socket.once('connect', () => {
        try {
          sendSocket(socket, {
            type: 'join',
            sessionId: input.sessionId,
            token: input.token,
            projectId: input.projectId,
            participantId: `remote_${randomUUID()}`,
            displayName: input.displayName,
          })
        } catch (error) {
          clearTimeout(timer)
          reject(error)
        }
      })
    }).catch(error => {
      socket.destroy()
      this.remoteConnections.delete(sender.id)
      throw error
    })
    remote.session = clone(result)
    remote.resolveJoin = undefined
    remote.rejectJoin = undefined
    return clone(result)
  }

  getSession(sender: WebContents) {
    const sessionId = this.localMembership.get(sender.id)
    if (sessionId) {
      const state = this.hostSessions.get(sessionId)
      if (state) return this.sessionForWindow(state, sender.id)
    }
    const remote = this.remoteConnections.get(sender.id)
    return remote ? clone(remote.session) : null
  }

  async publishProject(sender: WebContents, project: LowCodeProject) {
    const localSessionId = this.localMembership.get(sender.id)
    const local = localSessionId ? this.hostSessions.get(localSessionId) : undefined
    if (local) {
      this.assertProject(local.session, project)
      local.project = clone(project)
      this.broadcastHostProject(local, sender.id)
      return
    }
    const remote = this.remoteConnections.get(sender.id)
    if (!remote) throw new Error('当前未加入协作会话')
    this.assertProject(remote.session, project)
    sendSocket(remote.socket, { type: 'publish', project: clone(project) })
  }

  async leave(sender: WebContents) {
    const sessionId = this.localMembership.get(sender.id)
    if (sessionId) {
      const state = this.hostSessions.get(sessionId)
      this.localMembership.delete(sender.id)
      if (state) {
        state.windows.delete(sender.id)
        state.session.participants = state.session.participants.filter(item => item.id !== `window_${sender.id}`)
        if (state.ownerWebContentsId === sender.id || state.windows.size === 0) await this.closeHostSession(state)
        else this.emitSessionState(state)
      }
    }
    const remote = this.remoteConnections.get(sender.id)
    if (remote) {
      this.remoteConnections.delete(sender.id)
      try { sendSocket(remote.socket, { type: 'leave' }) } catch { /* socket may already be closed */ }
      remote.socket.destroy()
    }
    this.emitToWindow(sender.id, { type: 'left' })
  }

  detachWindow(webContentsId: number) {
    const fakeSender = { id: webContentsId } as WebContents
    void this.leave(fakeSender)
  }

  async close() {
    const sessions = [...this.hostSessions.values()]
    for (const state of sessions) await this.closeHostSession(state)
    for (const remote of this.remoteConnections.values()) remote.socket.destroy()
    this.remoteConnections.clear()
    this.localMembership.clear()
  }

  async attachWindow(webContents: WebContents, sessionId: string) {
    const state = this.hostSessions.get(sessionId)
    if (!state) {
      this.emitToWindow(webContents.id, { type: 'error', message: '协作会话已结束' })
      return
    }
    try {
      const session = await this.joinSession(webContents, {
        sessionId,
        projectId: state.session.projectId,
        token: state.session.token,
        displayName: '本机窗口',
      })
      this.emitToWindow(webContents.id, { type: 'session-state', session })
    } catch (error) {
      this.emitToWindow(webContents.id, { type: 'error', message: error instanceof Error ? error.message : '加入协作会话失败' })
    }
  }

  private assertProject(session: CollaborationSession, project: LowCodeProject) {
    if (!project || project.id !== session.projectId) throw new Error('协作项目不匹配')
    const bytes = Buffer.byteLength(JSON.stringify(project), 'utf8')
    if (bytes > MAX_MESSAGE_BYTES) throw new Error('项目过大，协作消息超过 12 MB')
  }

  private emitSessionState(state: HostSession) {
    for (const id of state.windows) {
      this.emitToWindow(id, { type: 'session-state', session: this.sessionForWindow(state, id) })
    }
    for (const connection of state.connections.values()) {
      try {
        sendSocket(connection.socket, {
          type: 'event',
          event: { type: 'session-state', session: { ...clone(state.session), role: 'guest' } },
        })
      } catch { /* close handler removes stale sockets */ }
    }
  }

  private sessionForWindow(state: HostSession, webContentsId: number) {
    return {
      ...clone(state.session),
      role: state.ownerWebContentsId === webContentsId ? 'host' as const : 'guest' as const,
    }
  }

  private broadcastHostProject(state: HostSession, originWebContentsId?: number, originConnection?: HostConnection) {
    const event: CollaborationEvent = {
      type: 'project-update',
      project: clone(state.project),
      originId: originWebContentsId ? `window_${originWebContentsId}` : originConnection?.participant.id || 'remote',
      updatedAt: state.project.updatedAt,
    }
    for (const id of state.windows) if (id !== originWebContentsId) this.emitToWindow(id, event)
    for (const connection of state.connections.values()) if (connection !== originConnection) {
      try { sendSocket(connection.socket, { type: 'event', event }) } catch { /* close handler removes stale sockets */ }
    }
  }

  private acceptHostConnection(state: HostSession, socket: net.Socket) {
    const connection: HostConnection = {
      id: makeId('peer'),
      socket,
      participant: { id: '', name: '局域网窗口', joinedAt: new Date().toISOString(), transport: 'lan', host: false },
      buffer: '',
    }
    state.connections.set(connection.id, connection)
    socket.setNoDelay(true)
    socket.on('data', chunk => this.handleHostData(state, connection, chunk.toString('utf8')))
    socket.on('error', () => this.removeHostConnection(state, connection))
    socket.on('close', () => this.removeHostConnection(state, connection))
  }

  private handleHostData(state: HostSession, connection: HostConnection, chunk: string) {
    connection.buffer += chunk
    if (Buffer.byteLength(connection.buffer, 'utf8') > MAX_MESSAGE_BYTES) {
      connection.socket.destroy()
      return
    }
    let index = connection.buffer.indexOf('\n')
    while (index >= 0) {
      const line = connection.buffer.slice(0, index)
      connection.buffer = connection.buffer.slice(index + 1)
      index = connection.buffer.indexOf('\n')
      try {
        const message = JSON.parse(line) as WireMessage
        if (message.type === 'join') {
          if (message.sessionId !== state.session.id || message.token !== state.session.token || message.projectId !== state.session.projectId) {
            sendSocket(connection.socket, { type: 'error', message: '协作会话口令或项目不匹配' })
            connection.socket.destroy()
            return
          }
          connection.participant = {
            id: message.participantId,
            name: message.displayName?.trim() || '局域网窗口',
            joinedAt: new Date().toISOString(),
            transport: 'lan',
            host: false,
          }
          state.session.participants = [...state.session.participants.filter(item => item.id !== connection.participant.id), connection.participant]
          sendSocket(connection.socket, { type: 'joined', session: clone(state.session) })
          sendSocket(connection.socket, { type: 'event', event: { type: 'project-update', project: clone(state.project), originId: 'host', updatedAt: state.project.updatedAt } })
          this.emitSessionState(state)
        } else if (message.type === 'publish') {
          if (!connection.participant.id) throw new Error('尚未完成协作握手')
          this.assertProject(state.session, message.project)
          state.project = clone(message.project)
          this.broadcastHostProject(state, undefined, connection)
        } else if (message.type === 'leave') {
          connection.socket.end()
        }
      } catch (error) {
        try { sendSocket(connection.socket, { type: 'error', message: error instanceof Error ? error.message : '协作消息无效' }) } catch { /* ignore */ }
      }
    }
  }

  private handleRemoteData(webContentsId: number, chunk: string) {
    const remote = this.remoteConnections.get(webContentsId)
    if (!remote) return
    remote.buffer += chunk
    if (Buffer.byteLength(remote.buffer, 'utf8') > MAX_MESSAGE_BYTES) {
      remote.socket.destroy()
      return
    }
    let index = remote.buffer.indexOf('\n')
    while (index >= 0) {
      const line = remote.buffer.slice(0, index)
      remote.buffer = remote.buffer.slice(index + 1)
      index = remote.buffer.indexOf('\n')
      try {
        const message = JSON.parse(line) as WireMessage
        if (message.type === 'joined') {
          remote.session = { ...clone(message.session), role: 'guest' }
          remote.resolveJoin?.(clone(remote.session))
          remote.resolveJoin = undefined
          remote.rejectJoin = undefined
        } else if (message.type === 'event') {
          this.emitToWindow(webContentsId, message.event)
        } else if (message.type === 'error') {
          remote.rejectJoin?.(new Error(message.message))
          this.emitToWindow(webContentsId, { type: 'error', message: message.message })
        }
      } catch {
        this.emitToWindow(webContentsId, { type: 'error', message: '收到无效的局域网协作消息' })
      }
    }
  }

  private removeHostConnection(state: HostSession, connection: HostConnection) {
    if (!state.connections.delete(connection.id)) return
    if (connection.participant.id) {
      state.session.participants = state.session.participants.filter(item => item.id !== connection.participant.id)
      this.emitSessionState(state)
    }
  }

  private async closeHostSession(state: HostSession) {
    this.hostSessions.delete(state.session.id)
    for (const id of state.windows) {
      this.localMembership.delete(id)
      this.emitToWindow(id, { type: 'left', reason: '协作会话已关闭' })
    }
    for (const connection of state.connections.values()) connection.socket.destroy()
    state.connections.clear()
    await new Promise<void>(resolve => {
      if (!state.server) return resolve()
      state.server.close(() => resolve())
    })
  }
}
