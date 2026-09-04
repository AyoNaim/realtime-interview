const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  throw new Error("DEEPGRAM_API_KEY is not configured.");
}

export const deepgramConfig = {
  apiKey: DEEPGRAM_API_KEY,

  model: "nova-3",
  language: "en-US",

  encoding: "linear16",
  sampleRate: 16000,
  channels: 1,

  interimResults: true,
  smartFormat: true,
  punctuate: true,

  endpointing: 300,
  utteranceEndMs: 1000,
};

export function buildDeepgramUrl(): string {
  const params = new URLSearchParams({
    model: deepgramConfig.model,
    language: deepgramConfig.language,
    encoding: deepgramConfig.encoding,
    sample_rate: String(deepgramConfig.sampleRate),
    channels: String(deepgramConfig.channels),
    interim_results: String(deepgramConfig.interimResults),
    smart_format: String(deepgramConfig.smartFormat),
    punctuate: String(deepgramConfig.punctuate),
    endpointing: String(deepgramConfig.endpointing),
    utterance_end_ms: String(deepgramConfig.utteranceEndMs),
  });

  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}