import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

import type { RealtimeSession } from "@/types/realtime";
import { RealtimeConnection } from "./connection";

const PORT = Number(process.env.REALTIME_PORT ?? 3001);

const wss = new WebSocketServer({
  port: PORT,
});

const sessions = new Map<string, RealtimeSession>();

wss.on("connection", (socket) => {
  const connectionId = randomUUID();
  const sessionId = randomUUID();

  const session: RealtimeSession = {
    sessionId,
    connectionId,
    state: "connected",
    createdAt: Date.now(),
  };

  sessions.set(sessionId, session);

  const connection = new RealtimeConnection(
    socket,
    session,
    () => sessions.delete(sessionId)
);

  connection.start();
});

console.log(`Realtime server listening on ws://localhost:${PORT}`);