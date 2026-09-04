import type {
  TranscriptSegment,
  TranscriptState,
} from "@/types/transcript";

export class TranscriptAccumulator {
  private finalized: TranscriptSegment[] = [];
  private interim: TranscriptSegment | null = null;

  add(segment: TranscriptSegment): void {
    if (segment.isFinal) {
      this.finalized.push(segment);
      this.interim = null;
      return;
    }

    this.interim = segment;
  }

  getState(): TranscriptState {
    return {
      finalized: [...this.finalized],
      interim: this.interim,
    };
  }

  getText(): string {
    const finalizedText = this.finalized
      .map((segment) => segment.text)
      .join(" ")
      .trim();

    const interimText = this.interim?.text.trim() ?? "";

    return [finalizedText, interimText]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  reset(): void {
    this.finalized = [];
    this.interim = null;
  }
}