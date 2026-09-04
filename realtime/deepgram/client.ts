// realtime/deepgram/client.ts

import WebSocket from "ws";

import {
  buildDeepgramUrl,
  deepgramConfig,
} from "./config";

import {
  parseDeepgramEvent,
  type DeepgramEvent,
} from "./events";

export class DeepgramClient {
  private socket: WebSocket | null = null;

  constructor(
    private readonly onEvent: (event: DeepgramEvent) => void,
    private readonly onError: (error: Error) => void,
    private readonly onClose: () => void,
  ) {}

  connect(): void {
    if (this.socket) {
      return;
    }

    const socket = new WebSocket(buildDeepgramUrl(), {
      headers: {
        Authorization: `Token ${deepgramConfig.apiKey}`,
      },
    });

    this.socket = socket;

    socket.on("open", () => {
      console.log("[deepgram] connection opened");
    });

    socket.on("message", (data) => {
      this.handleMessage(data.toString());
    });

    socket.on("error", (error) => {
      this.onError(
        error instanceof Error
          ? error
          : new Error(String(error)),
      );
    });

    socket.on("close", () => {
      this.socket = null;
      this.onClose();
    });
  }

  sendAudio(data: Buffer): void {
    if (!this.socket) {
      return;
    }

    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(data);
  }

  close(): void {
    if (!this.socket) {
      return;
    }

    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "CloseStream",
        }),
      );
    }

    this.socket.close();
    this.socket = null;
  }

  private handleMessage(data: string): void {
    const event = parseDeepgramEvent(data);

    if (event.type === "unknown") {
      return;
    }

    this.onEvent(event);
  }
}