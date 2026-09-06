import { streamLLMResponse } from "./stream";
import type { LLMRequest, LLMStreamEvent } from "@/types/llm";

const LLM_API_KEY = process.env.LLM_API_KEY;

const LLM_BASE_URL =
  process.env.LLM_BASE_URL ??
  "https://openrouter.ai/api/v1";

const LLM_MODEL =
  process.env.LLM_MODEL ??
  "openai/gpt-4o-mini";

const LLM_MAX_TOKENS = Number(
  process.env.LLM_MAX_TOKENS ?? 300,
);

if (!LLM_API_KEY) {
  throw new Error("LLM_API_KEY is not configured.");
}

export class LLMClient {
  private activeController: AbortController | null = null;

  async stream(
    request: LLMRequest,
    onEvent: (event: LLMStreamEvent) => void,
  ): Promise<void> {
    // Cancel any previous request before starting a new one.
    this.cancel();

    const controller = new AbortController();

    this.activeController = controller;

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

            // immediate useful output to reduce latency
            reasoning: {
              effort: "none",
            },

            // Keep answers short and cheap.
            max_tokens: LLM_MAX_TOKENS,

            messages: [
              {
                role: "user",
                content: request.prompt,
              },
            ],
          }),

          signal: controller.signal,
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

      if (controller.signal.aborted) {
        return;
      }

      onEvent({
        type: "complete",
        requestId: request.id,
      });
    } catch (error) {
      // Abort is expected when a newer question arrives.
      if (controller.signal.aborted) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Unknown LLM error.";

      onEvent({
        type: "error",
        requestId: request.id,
        message,
      });
    } finally {
      if (this.activeController === controller) {
        this.activeController = null;
      }
    }
  }

  cancel(): void {
    if (!this.activeController) {
      return;
    }

    this.activeController.abort();
    this.activeController = null;
  }
}