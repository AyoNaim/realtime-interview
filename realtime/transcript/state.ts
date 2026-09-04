import type { TranscriptState } from "@/types/transcript";

export function createTranscriptState(): TranscriptState {
    return {
        finalized: [],
        interim: null
    }
}

export function resetTranscriptState(state: TranscriptState): void {
    state.finalized = [];
    state.interim = null
}