import type { RawData, WebSocket } from "ws";

import type { RealtimeSession } from "@/types/realtime";
import type { ClientMessage, ServerMessage } from "./protocol";

export class RealtimeConnection {
  constructor(
    private readonly socket: WebSocket,
    private readonly session: RealtimeSession,
    private readonly onClose: () => void,
  ) {}

  start(): void {
    this.socket.on("message", (data, isBinary) => {
      this.handleMessage(data, isBinary);
    });

    this.socket.on("close", () => {
      this.handleClose();
    });

    this.socket.on("error", (error) => {
      console.error(
        `[realtime:${this.session.sessionId}] WebSocket error`,
        error,
      );
    });
  }

  private handleMessage(
    data: RawData,
    isBinary: boolean,
  ): void {
    const buffer = this.normalizeBuffer(data);

    if (isBinary) {
      this.handleAudio(buffer);
      return;
    }

    this.handleControlMessage(buffer);
  }

  private normalizeBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      return Buffer.from(data);
    }

    return Buffer.concat(data);
  }

  private handleAudio(data: Buffer): void {
    console.log(
      `[realtime:${this.session.sessionId}] audio chunk: ${data.length} bytes`,
    );
  }

  private handleControlMessage(data: Buffer): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(data.toString());
    } catch {
      this.send({
        type: "error",
        message: "Invalid realtime message.",
      });

      return;
    }

    if (!this.isClientMessage(parsed)) {
      this.send({
        type: "error",
        message: "Invalid realtime message.",
      });

      return;
    }

    this.handleClientMessage(parsed);
  }

  private isClientMessage(
    value: unknown,
  ): value is ClientMessage {
    if (!value || typeof value !== "object") {
      return false;
    }

    const message = value as Record<string, unknown>;

    switch (message.type) {
      case "session:start":
        return typeof message.sessionId === "string";

      case "session:stop":
        return true;

      default:
        return false;
    }
  }

  private handleClientMessage(message: ClientMessage): void {
    switch (message.type) {
      case "session:start":
        this.handleSessionStart(message.sessionId);
        break;

      case "session:stop":
        this.handleSessionStop();
        break;
    }
  }

  private handleSessionStart(sessionId: string): void {
    if (sessionId !== this.session.sessionId) {
      this.send({
        type: "error",
        message: "Session ID does not match connection.",
      });

      return;
    }

    console.log(
      `[realtime:${this.session.sessionId}] session started`,
    );
  }

  private handleSessionStop(): void {
    console.log(
      `[realtime:${this.session.sessionId}] session stopped`,
    );

    this.socket.close();
  }

  private send(message: ServerMessage): void {
    if (this.socket.readyState !== this.socket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private handleClose(): void {
    console.log(
      `[realtime:${this.session.sessionId}] connection closed`,
    );

    this.onClose();
  }
}