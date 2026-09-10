// The seam between the supervisor — which owns the trigger_state row, the
// serialization lane and the clock — and what each trigger kind does with it.
import type {
  PieceWorkerResult,
  TriggerHookRequest,
} from "@powerhousedao/reactor-connectors";
import type { TriggerStateRow, WorkflowRunStore } from "./store.js";
import type {
  PieceTriggerBinding,
  TriggerBinding,
  TriggerDeliveryKind,
} from "./trigger-binding.js";

// Everything a driver may reach for. It never touches the lane, the binding
// registry or the timer: the supervisor holds those.
export interface TriggerDriverContext {
  store: WorkflowRunStore;
  now: () => Date;
  fire: (workflowId: string, payload: unknown, kind: string) => void;
  defaultIntervalMs: number;
  // Runs one piece trigger hook; the supervisor supplies the webhook URL the
  // binding's delivery mode calls for.
  runHook: (
    binding: PieceTriggerBinding,
    hook: TriggerHookRequest["hook"],
    storeState: Record<string, unknown>,
    options?: { isRepublish?: boolean; payload?: unknown },
  ) => Promise<PieceWorkerResult>;
  // Drops a workflow from the healthy set, so an identical re-registration
  // is retried rather than skipped.
  markUnhealthy: (workflowId: string) => void;
}

// What the supervisor learned about the stored row before arming.
export interface EnableContext {
  existing: TriggerStateRow | undefined;
  // The stored config hash matches, so a cursor may be carried over.
  isRepublish: boolean;
}

// The kind-specific half of an ENABLED row; the supervisor fills the rest.
export interface EnabledState {
  storeState: string;
  intervalMs: number;
  // Null leaves the row unscheduled — what a request-driven kind wants, and
  // what keeps it out of listDueTriggerStates.
  nextPollAt: string | null;
  lastPollAt: string | null;
  // Trailing note for the log line, e.g. "every 300000ms".
  cadence: string;
}

// The same for an ERROR row, written when arming throws.
export interface FailedState {
  storeState: string;
  intervalMs: number;
  lastPollAt: string | null;
}

export interface TriggerDriver {
  readonly kind: TriggerDeliveryKind;
  // False keeps the kind out of the timer entirely; requests drive it.
  readonly scheduled: boolean;
  // Arms the trigger and describes the row to record. Throwing is how a
  // driver reports that the trigger could not be armed.
  arm(
    binding: TriggerBinding,
    context: EnableContext,
    ctx: TriggerDriverContext,
  ): Promise<EnabledState>;
  failedState(
    binding: TriggerBinding,
    context: EnableContext,
    ctx: TriggerDriverContext,
  ): FailedState;
  // Releases an external registration before the row goes DISABLED.
  release?(
    binding: TriggerBinding,
    row: TriggerStateRow,
    ctx: TriggerDriverContext,
  ): Promise<void>;
  // A row the timer found due; defined exactly when `scheduled`.
  onDue?(
    binding: TriggerBinding,
    row: TriggerStateRow,
    ctx: TriggerDriverContext,
  ): Promise<void>;
}
