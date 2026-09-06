import type { TranscriptState } from "@/types/transcript";

export interface SegmenterResult {
  shouldTrigger: boolean;
  text: string;
}

export class TranscriptSegmenter {
  private processedFinalizedCount = 0;

  evaluate(state: TranscriptState): SegmenterResult {
    const newSegments = state.finalized.slice(
      this.processedFinalizedCount,
    );

    if (newSegments.length === 0) {
      return {
        shouldTrigger: false,
        text: "",
      };
    }

    this.processedFinalizedCount =
      state.finalized.length;

    const meaningfulSegment = newSegments.find(
      (segment) =>
        this.isMeaningful(segment.text),
    );

    if (!meaningfulSegment) {
      return {
        shouldTrigger: false,
        text: "",
      };
    }

    const text = state.finalized
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      shouldTrigger: true,
      text,
    };
  }

  reset(): void {
    this.processedFinalizedCount = 0;
  }

  private isMeaningful(text: string): boolean {
    const normalized = text.trim();

    if (!normalized) {
      return false;
    }

    const wordCount =
      normalized.split(/\s+/).length;

    return wordCount >= 3;
  }
}