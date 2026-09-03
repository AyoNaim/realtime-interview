import type { ConnectionId, SessionId } from "@/types/realtime";
import type { TranscriptSegment } from "@/types/transcript";
import type { LLMStreamEvent } from "@/types/llm";

export type ClientMessage = 
    {
        type: "session:start";
        sessionId: SessionId
    }
    | {
        type: "audio";
        data: ArrayBuffer
    }
    | {
        type: "session:stop"
    }

export type ServerMessage = 
    {
        type: "session:ready";
        sessionId: SessionId;
        connectionId: ConnectionId;
    }
     | 
    {
        type: "transcript";
        segment: TranscriptSegment   
    }
     |
    {
        type: "llm";
        event: LLMStreamEvent
    } 
     |
    {
        type: "error";
        message: string
    }