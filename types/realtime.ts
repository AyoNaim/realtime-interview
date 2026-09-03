export type SessionId = string;

export type ConnectionId = string;

export type RealtimeConnectionState =
  | "connecting"
  | "connected"
  | "closing"
  | "closed";

export interface RealtimeSession {
    sessonId: SessionId;
    connectionId: ConnectionId;
    state: RealtimeConnectionState;
    createdAt: number;
}