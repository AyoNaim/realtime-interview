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

    const meaningfulSegment = newSegments.find((segment) =>
      this.isMeaningful(segment.text),
    );

    this.processedFinalizedCount = state.finalized.length;

    if (!meaningfulSegment) {
      return {
        shouldTrigger: false,
        text: "",
      };
    }

    return {
      shouldTrigger: true,
      text: meaningfulSegment.text.trim(),
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

    const wordCount = normalized.split(/\s+/).length;

    return wordCount >= 3;
  }
}