import { streamLLMResponse } from "./stream";
import type { LLMRequest, LLMStreamEvent } from "@/types/llm";

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL =
  process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1";
const LLM_MODEL =
  process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

if (!LLM_API_KEY) {
  throw new Error("LLM_API_KEY is not configured.");
}

export class LLMClient {
  async stream(
    request: LLMRequest,
    onEvent: (event: LLMStreamEvent) => void,
  ): Promise<void> {
    onEvent({
      type: "start",
      requestId: request.id,
    });

    try {
      const response = await fetch(
        `${LLM_BASE_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LLM_API_KEY}`,
          },
          body: JSON.stringify({
            model: LLM_MODEL,
            stream: true,
            messages: [
              {
                role: "user",
                content: request.prompt,
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `LLM request failed with status ${response.status}.`,
        );
      }

      if (!response.body) {
        throw new Error("LLM response has no body.");
      }

      await streamLLMResponse(
        response.body,
        request.id,
        onEvent,
      );

      onEvent({
        type: "complete",
        requestId: request.id,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown LLM error.";

      onEvent({
        type: "error",
        requestId: request.id,
        message,
      });
    }
  }
}