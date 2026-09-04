import type { RawData, WebSocket } from "ws";

import type { RealtimeSession } from "@/types/realtime";
import type { ClientMessage, ServerMessage } from "./protocol";
import {
  DeepgramClient,
  type DeepgramEvent,
} from "./deepgram/client";

export class RealtimeConnection {
  private readonly deepgram: DeepgramClient;

  constructor(
    private readonly socket: WebSocket,
    private readonly session: RealtimeSession,
    private readonly onClose: () => void,
  ) {
    this.deepgram = new DeepgramClient(
      (event) => {
        this.handleDeepgramEvent(event);
      },
      (error) => {
        this.handleDeepgramError(error);
      },
      () => {
        console.log(
          `[realtime:${this.session.sessionId}] Deepgram connection closed`,
        );
      },
    );
  }

  start(): void {
    this.deepgram.connect();

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
    this.deepgram.sendAudio(data);
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

    this.deepgram.close();
    this.socket.close();
  }

  private handleDeepgramEvent(
    event: DeepgramEvent,
  ): void {
    switch (event.type) {
      case "transcript":
        this.send({
          type: "transcript",
          segment: {
            id: crypto.randomUUID(),
            text: event.text,
            isFinal: event.isFinal,
            confidence: event.confidence,
            startTime: event.startTime,
            endTime: event.endTime,
          },
        });
        break;

      case "utterance_end":
        console.log(
          `[realtime:${this.session.sessionId}] utterance ended at ${event.lastWordEnd}s`,
        );
        break;

      case "speech_started":
        console.log(
          `[realtime:${this.session.sessionId}] speech started at ${event.timestamp}s`,
        );
        break;

      case "unknown":
        break;
    }
  }

  private handleDeepgramError(error: Error): void {
    console.error(
      `[realtime:${this.session.sessionId}] Deepgram error`,
      error,
    );

    this.send({
      type: "error",
      message: "Speech transcription service error.",
    });
  }

  private send(message: ServerMessage): void {
    if (this.socket.readyState !== this.socket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private handleClose(): void {
    this.deepgram.close();

    console.log(
      `[realtime:${this.session.sessionId}] connection closed`,
    );

    this.onClose();
  }
}