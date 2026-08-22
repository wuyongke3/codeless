import { utilityProcess, type UtilityProcess } from 'electron'

type DatabaseReadyMessage = { type: 'ready'; databasePath: string }
type DatabaseInitErrorMessage = { type: 'init-error'; error: { message: string; stack?: string } }
type DatabaseResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string; stack?: string } }

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

export class DatabaseClient {
  private process: UtilityProcess | null = null
  private nextRequestId = 1
  private pending = new Map<number, PendingRequest>()
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((reason?: unknown) => void) | null = null
  private closed = false

  async start(workerPath: string, databasePath: string) {
    if (this.process && this.readyPromise) return this.readyPromise
    this.closed = false
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    this.process = utilityProcess.fork(workerPath, [databasePath], {
      serviceName: 'Codeless SQLite Database',
      stdio: 'pipe',
    })
    this.process.on('message', message => this.handleMessage(message as DatabaseReadyMessage | DatabaseInitErrorMessage | DatabaseResponse))
    this.process.on('exit', code => {
      const error = new Error('SQLite utility process exited with code ' + code)
      this.rejectPending(error)
      this.readyReject?.(error)
      this.clearProcess()
    })
    this.process.on('error', (_type, location, report) => {
      const error = new Error('SQLite utility process fatal error at ' + (location || 'unknown') + (report ? ': ' + report : ''))
      this.rejectPending(error)
      this.readyReject?.(error)
    })
    return this.readyPromise
  }

  requestBatch<T>(operations: Array<{ method: string; args?: unknown[] }>) {
    return this.request<T[]>('batch', operations)
  }

  async request<T>(method: string, ...args: unknown[]): Promise<T> {
    if (!this.process || !this.readyPromise || this.closed) throw new Error('SQLite utility process is not running')
    await this.readyPromise
    const id = this.nextRequestId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject })
      try {
        this.process?.postMessage({ id, method, args })
      } catch (error) {
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  close() {
    this.closed = true
    this.rejectPending(new Error('SQLite utility process closed'))
    this.process?.kill()
    this.clearProcess()
  }

  private handleMessage(message: DatabaseReadyMessage | DatabaseInitErrorMessage | DatabaseResponse) {
    if (!message || typeof message !== 'object') return
    if ('type' in message && message.type === 'ready') {
      this.readyResolve?.()
      this.readyResolve = null
      this.readyReject = null
      return
    }
    if ('type' in message && message.type === 'init-error') {
      const error = new Error(message.error.message)
      error.stack = message.error.stack || error.stack
      this.readyReject?.(error)
      this.readyResolve = null
      this.readyReject = null
      return
    }
    if (!('id' in message) || typeof message.id !== 'number') return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    if (message.ok) pending.resolve(message.result)
    else {
      const error = new Error(message.error.message)
      error.stack = message.error.stack || error.stack
      pending.reject(error)
    }
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  private clearProcess() {
    this.process = null
    this.readyPromise = null
    this.readyResolve = null
    this.readyReject = null
  }
}
