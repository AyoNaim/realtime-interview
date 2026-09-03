export type transcriptSegmentId = string;

export interface TranscriptSegment {
    id: transcriptSegmentId;
    text: string;
    isFinal: boolean;
    confidence: number;
    startTime: number;
    endTime: number;
}

export interface TranscriptState {
  finalized: TranscriptSegment[];
  interim: TranscriptSegment | null;
}