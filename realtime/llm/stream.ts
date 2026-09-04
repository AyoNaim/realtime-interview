import type { LLMStreamEvent } from "@/types/llm";

export async function streamLLMResponse(
  body: ReadableStream<Uint8Array>,
  requestId: string,
  onEvent: (event: LLMStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const lines = buffer.split("\n");

      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const data = line.trim();

        if (!data || !data.startsWith("data:")) {
          continue;
        }

        const payload = data.slice(5).trim();

        if (payload === "[DONE]") {
          return;
        }

        const token = extractToken(payload);

        if (!token) {
          continue;
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
  } catch {
    return null;
  }
}