// realtime/deepgram/events.ts

export type DeepgramEvent =
  | {
      type: "transcript";
      text: string;
      isFinal: boolean;
      speechFinal: boolean;
      confidence: number;
      startTime: number;
      endTime: number;
    }
  | {
      type: "utterance_end";
      lastWordEnd: number;
    }
  | {
      type: "speech_started";
      timestamp: number;
    }
  | {
      type: "unknown";
    };

interface DeepgramTranscriptMessage {
  type: "Results";
  start: number;
  duration: number;
  is_final: boolean;
  speech_final: boolean;
  channel: {
    alternatives: Array<{
      transcript: string;
      confidence: number;
      words?: Array<{
        start: number;
        end: number;
        confidence: number;
      }>;
    }>;
  };
}

interface DeepgramUtteranceEndMessage {
  type: "UtteranceEnd";
  last_word_end: number;
}

interface DeepgramSpeechStartedMessage {
  type: "SpeechStarted";
  timestamp: number;
}

export function parseDeepgramEvent(
  data: string,
): DeepgramEvent {
  let message: unknown;

  try {
    message = JSON.parse(data);
  } catch {
    return {
      type: "unknown",
    };
  }

  if (!message || typeof message !== "object") {
    return {
      type: "unknown",
    };
  }

  const event = message as Record<string, unknown>;

  switch (event.type) {
    case "Results":
      return parseTranscript(
        message as DeepgramTranscriptMessage,
      );

    case "UtteranceEnd":
      return parseUtteranceEnd(
        message as DeepgramUtteranceEndMessage,
      );

    case "SpeechStarted":
      return parseSpeechStarted(
        message as DeepgramSpeechStartedMessage,
      );

    default:
      return {
        type: "unknown",
      };
  }
}

function parseTranscript(
  message: DeepgramTranscriptMessage,
): DeepgramEvent {
  const alternative = message.channel.alternatives[0];

  if (!alternative) {
    return {
      type: "unknown",
    };
  }

  const words = alternative.words ?? [];

  const startTime = words[0]?.start ?? message.start;

  const endTime =
    words.length > 0
      ? words[words.length - 1].end
      : message.start + message.duration;

  return {
    type: "transcript",
    text: alternative.transcript,
    isFinal: message.is_final,
    speechFinal: message.speech_final,
    confidence: alternative.confidence,
    startTime,
    endTime,
  };
}

function parseUtteranceEnd(
  message: DeepgramUtteranceEndMessage,
): DeepgramEvent {
  return {
    type: "utterance_end",
    lastWordEnd: message.last_word_end,
  };
}

function parseSpeechStarted(
  message: DeepgramSpeechStartedMessage,
): DeepgramEvent {
  return {
    type: "speech_started",
    timestamp: message.timestamp,
  };
}