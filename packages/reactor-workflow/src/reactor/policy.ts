// The workflow document's `policy` block, as the runtime reads it.
//
// Every field here was schema-and-editor only until W3.3: the document model
// has carried `concurrency`, `runTimeoutSeconds`, `defaultRetry` and
// `onFailure` since its first version and nothing ever read them, so an author
// who set them got no behaviour and no warning. The ones this module resolves
// are now enforced; the ones it does not are marked "not yet enforced" in the
// document model's own SDL, because a knob that lies is worse than one that is
// absent.
//
// A definition with NO policy at all enforces nothing; only hand-built
// definitions lack one. Every workflow document carries a policy: the field
// is non-null in the model since v1, initialised to QUEUE, PARK and a 3600s
// run timeout. Enforcing it therefore changes every deployed workflow; the
// README lists how.
import {
  effectiveRetryPolicy,
  type EffectiveRetryPolicy,
} from "../pieces/index.js";
import type { RunnableDefinition } from "./runnable.js";

export type ConcurrencyMode = "SINGLETON" | "QUEUE" | "PARALLEL";
export type FailureMode = "PARK" | "NOTIFY" | "IGNORE";

/** What the runtime enforces for one run. */
export interface EffectiveRunPolicy {
  concurrency: ConcurrencyMode;
  /** Runs of THIS workflow that may execute at once under PARALLEL; null is
   * unbounded. The serialising modes carry 1 in {@link concurrencyLimit}. */
  maxParallelRuns: number | null;
  /** Null when the author set no bound. */
  runTimeoutSeconds: number | null;
  onFailure: FailureMode;
  /** The fallback for a step with no `retry` of its own. */
  defaultRetry: EffectiveRetryPolicy | null;
}

/** The pre-enforcement behaviour, for a definition that declares no policy. */
export const UNENFORCED_POLICY: EffectiveRunPolicy = Object.freeze({
  concurrency: "PARALLEL",
  maxParallelRuns: null,
  runTimeoutSeconds: null,
  onFailure: "IGNORE",
  defaultRetry: null,
});

const CONCURRENCY_MODES: readonly string[] = ["SINGLETON", "QUEUE", "PARALLEL"];
const FAILURE_MODES: readonly string[] = ["PARK", "NOTIFY", "IGNORE"];

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** What the runtime enforces for a run of this definition. */
export function effectiveRunPolicy(
  runnable: Pick<RunnableDefinition, "policy">,
): EffectiveRunPolicy {
  const policy = runnable.policy as Record<string, unknown> | undefined | null;
  if (!policy) return UNENFORCED_POLICY;
  // An unknown mode reads as the unenforced one rather than as the strictest:
  // a reactor on an older build must not start serialising or parking because
  // a newer schema added a value it cannot interpret.
  const concurrency = CONCURRENCY_MODES.includes(policy.concurrency as string)
    ? (policy.concurrency as ConcurrencyMode)
    : "PARALLEL";
  return {
    concurrency,
    maxParallelRuns:
      concurrency === "PARALLEL" ? positive(policy.maxParallelRuns) : null,
    runTimeoutSeconds: positive(policy.runTimeoutSeconds),
    onFailure: FAILURE_MODES.includes(policy.onFailure as string)
      ? (policy.onFailure as FailureMode)
      : "IGNORE",
    defaultRetry: effectiveRetryPolicy(policy.defaultRetry),
  };
}

/** How many runs of one workflow may execute at once; 1 for both serialising
 * modes, so the gate holds one number rather than three branches. Null is
 * unbounded, i.e. no gate at all. */
export function concurrencyLimit(policy: EffectiveRunPolicy): number | null {
  if (policy.concurrency === "PARALLEL") return policy.maxParallelRuns;
  return 1;
}

/** The trigger status PARK leaves behind. Not ENABLED, so the supervisor's
 * due-trigger query does not return it and the schedule stops refiring; a
 * re-publish or re-enable arms it again, which is the way out. */
export const PARKED_TRIGGER_STATUS = "PARKED";

/** The run status a firing skipped by SINGLETON is journaled under, and the
 * one a run that passed `runTimeoutSeconds` ends in. Both are "this run did
 * not finish and nothing is wrong with the workflow", which is what the
 * document model's RunStatus.CANCELLED means. */
export const CANCELLED_RUN_STATUS = "CANCELLED";
