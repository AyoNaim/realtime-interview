export type LLMRequestId = string;

export interface LLMRequest {
  id: LLMRequestId;
  prompt: string;
}

export type LLMStreamEvent =
  | {
      type: "start";
      requestId: LLMRequestId;
    }
  | {
      type: "token";
      requestId: LLMRequestId;
      token: string;
    }
  | {
      type: "complete";
      requestId: LLMRequestId;
    }
  | {
      type: "error";
      requestId: LLMRequestId;
      message: string;
    };