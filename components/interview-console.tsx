"use client";

import { useEffect, useRef, useState } from "react";

import { LiveTranscript } from "./live-transcript";
import { ResponseStream } from "./response-stream";
import { LatencyMeter } from "./latency-meter";
import {
  PipelineVisualizer,
  type PipelineStage,
} from "./pipeline-visualizer";

import type { TranscriptSegment } from "@/types/transcript";
import type { ServerMessage } from "@/realtime/protocol";

const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL ??
  "ws://localhost:3001";

const TARGET_SAMPLE_RATE = 16_000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected";

export default function InterviewConsole() {
  const socketRef = useRef<WebSocket | null>(null);

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const mediaStreamRef =
    useRef<MediaStream | null>(null);

  const mediaSourceRef =
    useRef<MediaStreamAudioSourceNode | null>(null);

  const processorRef =
    useRef<ScriptProcessorNode | null>(null);

  const isCapturingRef =
    useRef(false);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");

  const [isRecording, setIsRecording] =
    useState(false);

  const [elapsedTime, setElapsedTime] =
    useState(0);

  const [transcriptSegments, setTranscriptSegments] =
    useState<TranscriptSegment[]>([]);

  const [interimTranscript, setInterimTranscript] =
    useState<TranscriptSegment | null>(null);

  const [microphoneError, setMicrophoneError] =
    useState<string | null>(null);

  const [response] =
    useState("");

  const [isStreaming] =
    useState(false);

  const [latencyMs] =
    useState<number | null>(null);

  const [isMeasuringLatency] =
    useState(false);

  const [pipeline, setPipeline] = useState({
    capture: "idle" as PipelineStage,
    stt: "idle" as PipelineStage,
    inference: "idle" as PipelineStage,
    response: "idle" as PipelineStage,
  });

  useEffect(() => {
    const socket = new WebSocket("wss://redesigned-carnival-7q5gv64x6vxhr769-3001.app.github.dev");

    socketRef.current = socket;

    setConnectionState("connecting");

    socket.addEventListener("open", () => {
      console.log("[realtime] WebSocket connected");

      setConnectionState("connected");

      /*
       * The realtime server creates the Deepgram connection
       * as soon as the WebSocket connection is established.
       *
       * Start microphone capture only after the WebSocket
       * is ready so audio does not get discarded while the
       * connection is still opening.
       */
      void startMicrophone();
    });

    socket.addEventListener("message", (event) => {
      handleServerMessage(event.data);
    });

    socket.addEventListener("close", () => {
      console.log("[realtime] WebSocket disconnected");

      setConnectionState("disconnected");

      stopMicrophone();
    });

    socket.addEventListener("error", (error) => {
      console.error(
        "[realtime] WebSocket error",
        error,
      );

      setConnectionState("disconnected");

      stopMicrophone();
    });

    return () => {
      stopMicrophone();

      socket.close();

      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedTime((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRecording]);

  const startMicrophone = async (): Promise<void> => {
    if (isCapturingRef.current) {
      return;
    }

    const socket = socketRef.current;

    if (!socket) {
      setMicrophoneError(
        "Realtime connection is unavailable.",
      );

      return;
    }

    if (socket.readyState !== WebSocket.OPEN) {
      setMicrophoneError(
        "Realtime connection is not ready.",
      );

      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneError(
        "Microphone access is not supported by this browser.",
      );

      return;
    }

    try {
      setMicrophoneError(null);

      console.log(
        "[microphone] requesting microphone access",
      );

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

      console.log(
        "[microphone] microphone access granted",
      );

      mediaStreamRef.current = stream;

      const audioContext =
        new AudioContext();

      audioContextRef.current =
        audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      console.log(
        `[microphone] input sample rate: ${audioContext.sampleRate}Hz`,
      );

      const source =
        audioContext.createMediaStreamSource(
          stream,
        );

      mediaSourceRef.current = source;

      const processor =
        audioContext.createScriptProcessor(
          SCRIPT_PROCESSOR_BUFFER_SIZE,
          1,
          1,
        );

      processorRef.current = processor;

      processor.onaudioprocess = (
        event,
      ) => {
        const currentSocket =
          socketRef.current;

        if (
          !currentSocket ||
          currentSocket.readyState !==
            WebSocket.OPEN
        ) {
          return;
        }

        const input =
          event.inputBuffer.getChannelData(0);

        const pcm =
          downsampleTo16BitPCM(
            input,
            audioContext.sampleRate,
            TARGET_SAMPLE_RATE,
          );

        if (pcm.byteLength === 0) {
          return;
        }

        currentSocket.send(pcm);
      };

      /*
       * ScriptProcessorNode needs to be connected to the
       * audio graph to continue receiving audio events.
       *
       * We send the output to a muted GainNode so the
       * microphone is not played back through the speakers.
       */
      const silentGain =
        audioContext.createGain();

      silentGain.gain.value = 0;

      source.connect(processor);

      processor.connect(silentGain);

      silentGain.connect(
        audioContext.destination,
      );

      isCapturingRef.current = true;

      setIsRecording(true);

      setElapsedTime(0);

      setPipeline((current) => ({
        ...current,
        capture: "active",
        stt: "active",
      }));

      console.log(
        "[microphone] PCM streaming started",
      );
    } catch (error) {
      console.error(
        "[microphone] failed to start",
        error,
      );

      stopMicrophone();

      if (
        error instanceof DOMException &&
        error.name === "NotAllowedError"
      ) {
        setMicrophoneError(
          "Microphone access was denied. Allow microphone access in your browser.",
        );
      } else if (
        error instanceof DOMException &&
        error.name === "NotFoundError"
      ) {
        setMicrophoneError(
          "No microphone was found on this device.",
        );
      } else if (
        error instanceof DOMException &&
        error.name === "NotReadableError"
      ) {
        setMicrophoneError(
          "The microphone is already being used by another application.",
        );
      } else {
        setMicrophoneError(
          "Unable to access the microphone.",
        );
      }
    }
  };

  const stopMicrophone = (): void => {
    isCapturingRef.current = false;

    if (processorRef.current) {
      processorRef.current.onaudioprocess =
        null;

      processorRef.current.disconnect();

      processorRef.current = null;
    }

    if (mediaSourceRef.current) {
      mediaSourceRef.current.disconnect();

      mediaSourceRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current
        .getTracks()
        .forEach((track) => {
          track.stop();
        });

      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();

      audioContextRef.current = null;
    }

    setIsRecording(false);

    setPipeline((current) => ({
      ...current,
      capture: "idle",
    }));
  };

  const handleServerMessage = (
    data: unknown,
  ): void => {
    if (typeof data !== "string") {
      return;
    }

    let message: unknown;

    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (!isServerMessage(message)) {
      return;
    }

    switch (message.type) {
      case "session:ready":
        console.log(
          "[realtime] session ready",
          message.sessionId,
        );

        break;

      case "transcript":
        handleTranscript(message.segment);

        break;

      case "llm":
        /*
         * LLM is intentionally not being used yet.
         */
        break;

      case "error":
        console.error(
          `[realtime] ${message.message}`,
        );

        break;
    }
  };

  const handleTranscript = (
    segment: TranscriptSegment,
  ): void => {
    setPipeline((current) => ({
      ...current,
      stt: segment.isFinal
        ? "complete"
        : "active",
    }));

    if (segment.isFinal) {
      setTranscriptSegments(
        (current) => [
          ...current,
          segment,
        ],
      );

      setInterimTranscript(null);

      return;
    }

    setInterimTranscript(segment);
  };

  return (
    <main className="min-h-screen bg-[#0d0d0c] text-[#e9e7e1]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 py-6 md:px-10 md:py-8">
        <header className="flex items-center justify-between border-b border-[#e9e7e1]/15 pb-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#e9e7e1]/50">
            Realtime / 01
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isRecording
                  ? "bg-[#d66a3d]"
                  : connectionState ===
                      "connected"
                    ? "bg-[#e9e7e1]/50"
                    : "bg-[#e9e7e1]/25"
              }`}
            />

            <span className="text-[#e9e7e1]/55">
              {isRecording
                ? "listening"
                : connectionState}
            </span>
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16 md:py-24">
          <LiveTranscript
            segments={transcriptSegments}
            interim={interimTranscript}
          />

          <div className="mt-20 border-t border-[#e9e7e1]/15 pt-8 md:mt-28">
            <ResponseStream
              response={response}
              isStreaming={isStreaming}
            />
          </div>
        </section>

        <footer className="border-t border-[#e9e7e1]/15 pt-5">
          <div className="mb-8">
            <PipelineVisualizer
              capture={pipeline.capture}
              stt={pipeline.stt}
              inference="idle"
              response="idle"
            />
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="grid grid-cols-4 gap-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#e9e7e1]/45">
                <div className="mb-2 text-[#e9e7e1]/25">
                  Capture
                </div>

                <div className="text-[#e9e7e1]/70">
                  {isRecording
                    ? "Streaming"
                    : "Idle"}
                </div>
              </div>

              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#e9e7e1]/45">
                <div className="mb-2 text-[#e9e7e1]/25">
                  STT
                </div>

                <div className="text-[#e9e7e1]/70">
                  {pipeline.stt}
                </div>
              </div>

              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#e9e7e1]/45">
                <div className="mb-2 text-[#e9e7e1]/25">
                  Inference
                </div>

                <div className="text-[#e9e7e1]/70">
                  Offline
                </div>
              </div>

              <LatencyMeter
                latencyMs={latencyMs}
                isMeasuring={isMeasuringLatency}
              />
            </div>

            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#e9e7e1]/40">
              {formatElapsedTime(elapsedTime)}
            </div>
          </div>

          {microphoneError && (
            <p
              role="alert"
              className="mt-5 border-t border-[#e9e7e1]/10 pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d66a3d]/80"
            >
              {microphoneError}
            </p>
          )}
        </footer>
      </div>
    </main>
  );
}

function downsampleTo16BitPCM(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number,
): ArrayBuffer {
  if (
    inputSampleRate === targetSampleRate
  ) {
    return float32To16BitPCM(input);
  }

  if (
    targetSampleRate > inputSampleRate
  ) {
    throw new Error(
      "Target sample rate must not exceed input sample rate.",
    );
  }

  const sampleRateRatio =
    inputSampleRate / targetSampleRate;

  const outputLength = Math.floor(
    input.length / sampleRateRatio,
  );

  const output = new Int16Array(
    outputLength,
  );

  let inputIndex = 0;

  for (
    let outputIndex = 0;
    outputIndex < outputLength;
    outputIndex++
  ) {
    const nextInputIndex = Math.floor(
      (outputIndex + 1) *
        sampleRateRatio,
    );

    let sum = 0;
    let count = 0;

    while (
      inputIndex < nextInputIndex &&
      inputIndex < input.length
    ) {
      sum += input[inputIndex];

      count++;
      inputIndex++;
    }

    const sample =
      count > 0 ? sum / count : 0;

    const clamped = Math.max(
      -1,
      Math.min(1, sample),
    );

    output[outputIndex] =
      clamped < 0
        ? clamped * 0x8000
        : clamped * 0x7fff;
  }

  return output.buffer;
}

function float32To16BitPCM(
  input: Float32Array,
): ArrayBuffer {
  const output = new Int16Array(
    input.length,
  );

  for (
    let index = 0;
    index < input.length;
    index++
  ) {
    const clamped = Math.max(
      -1,
      Math.min(1, input[index]),
    );

    output[index] =
      clamped < 0
        ? clamped * 0x8000
        : clamped * 0x7fff;
  }

  return output.buffer;
}

function isServerMessage(
  value: unknown,
): value is ServerMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<
    string,
    unknown
  >;

  switch (message.type) {
    case "session:ready":
      return (
        typeof message.sessionId ===
          "string" &&
        typeof message.connectionId ===
          "string"
      );

    case "transcript":
      return (
        typeof message.segment ===
          "object" &&
        message.segment !== null
      );

    case "llm":
      return (
        typeof message.event ===
          "object" &&
        message.event !== null
      );

    case "error":
      return (
        typeof message.message === "string"
      );

    default:
      return false;
  }
}

function formatElapsedTime(
  seconds: number,
): string {
  const minutes = Math.floor(
    seconds / 60,
  );

  const remainingSeconds =
    seconds % 60;

  return `${String(minutes).padStart(
    2,
    "0",
  )}:${String(remainingSeconds).padStart(
    2,
    "0",
  )}`;
}