import type { LLMStreamEvent } from "@/types/llm";

export async function streamLLMResponse(
  body: ReadableStream<Uint8Array>,
  requestId: string,
  onEvent: (event: LLMStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let tokenCount = 0;

  console.log("[llm-stream] reader started", {
    requestId,
  });

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        console.log("[llm-stream] reader done", {
          requestId,
          tokenCount,
        });

        break;
      }

      const chunk = decoder.decode(value, {
        stream: true,
      });

      console.log("[llm-stream] chunk received", {
        requestId,
        bytes: value.byteLength,
        preview: chunk.slice(0, 300),
      });

      buffer += chunk;

      const lines = buffer.split("\n");

      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const data = line.trim();

        if (!data || !data.startsWith("data:")) {
          continue;
        }

        const payload = data.slice(5).trim();

        console.log("[llm-stream] SSE payload", {
          requestId,
          payload: payload.slice(0, 500),
        });

        if (payload === "[DONE]") {
          console.log("[llm-stream] DONE", {
            requestId,
            tokenCount,
          });

          return;
        }

        const token = extractToken(payload);

        if (!token) {
          console.log("[llm-stream] no token in payload", {
            requestId,
          });

          continue;
        }

        tokenCount++;

        if (tokenCount === 1) {
          console.log("[llm-stream] FIRST TOKEN", {
            requestId,
            token,
          });
        }

        onEvent({
          type: "token",
          requestId,
          token,
        });
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function extractToken(
  payload: string,
): string | null {
  try {
    const parsed: unknown = JSON.parse(payload);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const data = parsed as {
      choices?: Array<{
        delta?: {
          content?: unknown;
        };
      }>;
    };

    const content =
      data.choices?.[0]?.delta?.content;

    return typeof content === "string"
      ? content
      : null;
  } catch (error) {
    console.error(
      "[llm-stream] failed to parse SSE payload",
      {
        payload,
        error,
      },
    );

    return null;
  }
}