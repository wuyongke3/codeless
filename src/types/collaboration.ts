import type { LowCodeProject } from './lowcode'

export type CollaborationMode = 'same-device' | 'lan'
export type CollaborationRole = 'host' | 'guest'
export type CollaborationTransport = 'electron' | 'lan'

export interface CollaborationParticipant {
  id: string
  name: string
  joinedAt: string
  transport: CollaborationTransport
  host: boolean
}

export interface CollaborationSession {
  id: string
  projectId: string
  mode: CollaborationMode
  role: CollaborationRole
  host: string
  port?: number
  token: string
  createdAt: string
  participants: CollaborationParticipant[]
}

export interface CollaborationCreateInput {
  project: LowCodeProject
  mode: CollaborationMode
  displayName?: string
}

export interface CollaborationJoinInput {
  sessionId: string
  projectId: string
  token: string
  host?: string
  port?: number
  displayName?: string
}

export type CollaborationEvent =
  | { type: 'session-state'; session: CollaborationSession }
  | { type: 'project-update'; project: LowCodeProject; originId: string; updatedAt: string }
  | { type: 'left'; reason?: string }
  | { type: 'error'; message: string }

export interface CollaborationApi {
  createSession: (input: CollaborationCreateInput) => Promise<CollaborationSession>
  joinSession: (input: CollaborationJoinInput) => Promise<CollaborationSession>
  getSession: () => Promise<CollaborationSession | null>
  publishProject: (project: LowCodeProject) => Promise<{ success: boolean }>
  leaveSession: () => Promise<{ success: boolean }>
  openWindow: () => Promise<{ success: boolean }>
  onEvent: (listener: (event: CollaborationEvent) => void) => () => void
}
