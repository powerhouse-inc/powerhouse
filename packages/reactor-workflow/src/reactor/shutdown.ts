import { PieceWorkerDisposedError } from "../pieces/index.js";

/** A firing refused because this runtime has shut down: retryable elsewhere. */
export class WorkflowRuntimeClosedError extends Error {
  constructor(readonly workflowId: string) {
    super(
      `Workflow ${workflowId} was not run: this workflow runtime has shut down`,
    );
    this.name = "WorkflowRuntimeClosedError";
  }
}

// `cause` is what the stop cut short, a hook it killed in flight included.
export class TriggerSupervisorStoppedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The trigger supervisor has stopped", options);
    this.name = "TriggerSupervisorStoppedError";
  }
}

// Not PieceWorkerExitError: a hook killed in flight may have checkpointed.
export function isShutdownRefusal(error: unknown): boolean {
  return (
    error instanceof TriggerSupervisorStoppedError ||
    error instanceof WorkflowRuntimeClosedError ||
    error instanceof PieceWorkerDisposedError
  );
}
