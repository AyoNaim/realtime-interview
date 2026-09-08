import { streamLLMResponse } from "./stream";
import type { LLMRequest, LLMStreamEvent } from "@/types/llm";

const LLM_API_KEY = process.env.LLM_API_KEY;

const LLM_BASE_URL =
  process.env.LLM_BASE_URL ||
  "https://openrouter.ai/api/v1";

const LLM_MODEL =
  process.env.LLM_MODEL?.trim() ||
  "openai/gpt-4o-mini";

const LLM_MAX_TOKENS = Number(
  process.env.LLM_MAX_TOKENS || 300,
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
    this.cancel();

    const controller = new AbortController();

    this.activeController = controller;

    console.log("[llm] request started", {
      requestId: request.id,
      model: LLM_MODEL,
      baseUrl: LLM_BASE_URL,
    });

    onEvent({
      type: "start",
      requestId: request.id,
    });

    try {
      console.log("[llm] sending HTTP request");

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
            reasoning: {
              effort: "none",
            },
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

      console.log("[llm] HTTP response received", {
        requestId: request.id,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        console.error("[llm] HTTP error body", errorBody);

        throw new Error(
          `LLM request failed with status ${response.status}: ${errorBody}`,
        );
      }

      if (!response.body) {
        throw new Error("LLM response has no body.");
      }

      console.log("[llm] streaming started", {
        requestId: request.id,
      });

      await streamLLMResponse(
        response.body,
        request.id,
        onEvent,
      );

      if (controller.signal.aborted) {
        console.log("[llm] request aborted", {
          requestId: request.id,
        });

        return;
      }

      console.log("[llm] stream complete", {
        requestId: request.id,
      });

      onEvent({
        type: "complete",
        requestId: request.id,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        console.log("[llm] request aborted", {
          requestId: request.id,
        });

        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Unknown LLM error.";

      console.error("[llm] request failed", {
        requestId: request.id,
        error,
      });

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

    console.log("[llm] cancelling previous request");

    this.activeController.abort();
    this.activeController = null;
  }
}