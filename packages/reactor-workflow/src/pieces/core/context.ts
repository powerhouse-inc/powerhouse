// What the host serves a core action: Activepieces' ctx.run suspend and stop
// members, plus the approval and expiry fields only core blocks may set.
import type { RunResponse } from "../activepieces/worker/protocol.js";
import type { WaitpointApproval } from "../engine/types.js";

export interface CoreWaitpointCall {
  type: "DELAY" | "WEBHOOK";
  resumeDateTime?: string;
  approval?: WaitpointApproval;
  expiresAt?: string;
  // A function is given the waitpoint's resume URL before it is created.
  responseToSend?: RunResponse | ((resumeUrl: string) => RunResponse);
}

export interface CoreActionContext {
  propsValue: Record<string, unknown>;
  executionType: "BEGIN" | "RESUME";
  // The delivery that woke a RESUME run.
  resumePayload?: unknown;
  run: {
    canPause: boolean;
    createWaitpoint(
      call: CoreWaitpointCall,
    ): Promise<{ id: string; resumeUrl: string }>;
    waitForWaitpoint(waitpointId: string): void;
    // Ends the run SUCCEEDED after this step, answering a held request.
    stop(params?: { response?: RunResponse }): void;
  };
}

export class CoreCannotPauseError extends Error {
  constructor(block: string) {
    super(
      `${block} suspends the run, which only a workflow run can do, not a step test`,
    );
    this.name = "RunCannotPauseError";
  }
}
