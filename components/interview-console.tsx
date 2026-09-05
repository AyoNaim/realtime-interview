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
  "wss://redesigned-carnival-7q5gv64x6vxhr769-3001.app.github.dev";

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

  const sessionStartedRef =
    useRef(false);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");

  const [sessionId, setSessionId] =
    useState<string | null>(null);

  const [isRecording, setIsRecording] =
    useState(false);

  const [elapsedTime, setElapsedTime] =
    useState(0);

  const [transcriptSegments, setTranscriptSegments] =
    useState<TranscriptSegment[]>([]);

  const [interimTranscript, setInterimTranscript] =
    useState<TranscriptSegment | null>(null);

  const [response, setResponse] =
    useState("");

  const [isStreaming, setIsStreaming] =
    useState(false);

  const [latencyMs, setLatencyMs] =
    useState<number | null>(null);

  const [isMeasuringLatency, setIsMeasuringLatency] =
    useState(false);

  const [microphoneError, setMicrophoneError] =
    useState<string | null>(null);

  const [pipeline, setPipeline] = useState({
    capture: "idle" as PipelineStage,
    stt: "idle" as PipelineStage,
    inference: "idle" as PipelineStage,
    response: "idle" as PipelineStage,
  });

  const llmStartTimeRef =
    useRef<number | null>(null);

  useEffect(() => {
    const socket = new WebSocket(REALTIME_URL);

    socketRef.current = socket;
    setConnectionState("connecting");

    socket.addEventListener("open", () => {
      setConnectionState("connected");
    });

    socket.addEventListener("message", (event) => {
      handleServerMessage(event.data);
    });

    socket.addEventListener("close", () => {
      setConnectionState("disconnected");
      setSessionId(null);
      sessionStartedRef.current = false;

      stopMicrophone();
    });

    socket.addEventListener("error", () => {
      setConnectionState("disconnected");
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
        setSessionId(message.sessionId);

        if (!sessionStartedRef.current) {
          sessionStartedRef.current = true;

          socketRef.current?.send(
            JSON.stringify({
              type: "session:start",
              sessionId: message.sessionId,
            }),
          );
        }

        break;

      case "transcript":
        handleTranscript(message.segment);
        break;

      case "llm":
        handleLLMEvent(message.event);
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
      setTranscriptSegments((current) => [
        ...current,
        segment,
      ]);

      setInterimTranscript(null);
      return;
    }

    setInterimTranscript(segment);
  };

  const handleLLMEvent = (
    event: Extract<
      ServerMessage,
      { type: "llm" }
    >["event"],
  ): void => {
    switch (event.type) {
      case "start":
        setResponse("");
        setIsStreaming(true);
        setIsMeasuringLatency(true);

        llmStartTimeRef.current =
          performance.now();

        setPipeline((current) => ({
          ...current,
          inference: "active",
          response: "idle",
        }));

        break;

      case "token":
        if (llmStartTimeRef.current !== null) {
          const elapsed =
            performance.now() -
            llmStartTimeRef.current;

          setLatencyMs(elapsed);
          setIsMeasuringLatency(false);
        }

        setResponse((current) =>
          current + event.token,
        );

        setPipeline((current) => ({
          ...current,
          response: "active",
        }));

        break;

      case "complete":
        setIsStreaming(false);

        setPipeline((current) => ({
          ...current,
          inference: "complete",
          response: "complete",
        }));

        break;

      case "error":
        setIsStreaming(false);
        setIsMeasuringLatency(false);

        setPipeline((current) => ({
          ...current,
          inference: "idle",
          response: "idle",
        }));

        break;
    }
  };

  const toggleRecording = async (): Promise<void> => {
    if (connectionState !== "connected") {
      return;
    }

    if (isRecording) {
      stopMicrophone();
      return;
    }

    await startMicrophone();
  };

  const startMicrophone = async (): Promise<void> => {
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

    if (!sessionId) {
      setMicrophoneError(
        "Realtime session is not ready yet.",
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

      /*
       * Permission is requested only after the user
       * explicitly clicks "Start recording".
       */
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

      mediaStreamRef.current = stream;

      const audioContext =
        new AudioContext();

      audioContextRef.current =
        audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

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

        if (!mediaStreamRef.current) {
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
       * Connect the microphone to the processor.
       *
       * We connect the processor to the destination
       * at a zero-gain level so the browser keeps the
       * processing node active without playing the
       * microphone back to the user.
       */
      const silentGain =
        audioContext.createGain();

      silentGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(
        audioContext.destination,
      );

      setElapsedTime(0);
      setIsRecording(true);

      setPipeline((current) => ({
        ...current,
        capture: "active",
        stt: "idle",
      }));
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
          "Microphone access was denied. Allow microphone access in your browser to start recording.",
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
                connectionState === "connected"
                  ? "bg-[#d66a3d]"
                  : "bg-[#e9e7e1]/25"
              }`}
            />

            <span className="text-[#e9e7e1]/55">
              {connectionState}
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
              inference={pipeline.inference}
              response={pipeline.response}
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
                  {isStreaming
                    ? "Streaming"
                    : pipeline.inference}
                </div>
              </div>

              <LatencyMeter
                latencyMs={latencyMs}
                isMeasuring={isMeasuringLatency}
              />
            </div>

            <div className="flex items-center gap-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#e9e7e1]/40">
                {formatElapsedTime(elapsedTime)}
              </div>

              <button
                type="button"
                onClick={toggleRecording}
                disabled={
                  connectionState !== "connected"
                }
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#e9e7e1]/75 transition-opacity hover:text-[#e9e7e1] disabled:cursor-not-allowed disabled:opacity-25"
              >
                <span
                  className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                    isRecording
                      ? "bg-[#d66a3d]"
                      : "bg-[#e9e7e1]/30"
                  }`}
                />

                {isRecording
                  ? "Stop recording"
                  : "Start recording"}
              </button>
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
        typeof message.sessionId === "string" &&
        typeof message.connectionId === "string"
      );

    case "transcript":
      return (
        typeof message.segment === "object" &&
        message.segment !== null
      );

    case "llm":
      return (
        typeof message.event === "object" &&
        message.event !== null
      );

    case "error":
      return typeof message.message === "string";

    default:
      return false;
  }
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

function formatElapsedTime(
  seconds: number,
): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(
    2,
    "0",
  )}:${String(remainingSeconds).padStart(
    2,
    "0",
  )}`;
}