// Per-step retry, as the coordinator runs it.
//
// The workflow document has carried a step `retry` block and a workflow
// `defaultRetry` since its first version and nothing read either one, so an
// author who set `maxAttempts: 3` got exactly one attempt and no warning
// (W3.3, backlog item 4). This is the policy, resolved; `coordinator.ts`
// applies it.
//
// It lives in the piece layer rather than beside the rest of the policy
// because the coordinator is here and nothing under `src/pieces` may import
// `src/reactor`.

export type BackoffKind = "FIXED" | "EXPONENTIAL";

/** A retry policy with every field resolved; `maxAttempts` is already clamped. */
export interface EffectiveRetryPolicy {
  maxAttempts: number;
  backoff: BackoffKind;
  initialDelaySeconds: number;
  maxDelaySeconds: number;
  /** Empty means every error is retryable; see {@link isRetryableError}. */
  retryOn: readonly string[];
}

/**
 * A step's attempt ceiling.
 *
 * Clamped rather than trusted: `maxAttempts` is author input with no bound in
 * the schema, and each attempt re-runs a side effect and holds the run's
 * worker slot. Ten is well past any useful retry and far short of a workflow
 * that cannot be stopped.
 */
export const MAX_STEP_ATTEMPTS = 10;

/** The ceiling on one backoff wait, whatever `maxDelaySeconds` says: the wait
 * holds the run's worker slot, and the run deadline bounds the rest. */
export const MAX_RETRY_DELAY_MS = 5 * 60_000;

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** Resolves an author-written retry block; null when it asks for one attempt,
 * which is the same thing as no retry policy and saves every reader a branch. */
export function effectiveRetryPolicy(
  retry: unknown,
): EffectiveRetryPolicy | null {
  if (typeof retry !== "object" || retry === null) return null;
  const record = retry as Record<string, unknown>;
  const asked = positive(record.maxAttempts) ?? 1;
  const maxAttempts = Math.min(Math.trunc(asked), MAX_STEP_ATTEMPTS);
  if (maxAttempts <= 1) return null;
  const initial = positive(record.initialDelaySeconds) ?? 0;
  const max = positive(record.maxDelaySeconds) ?? initial;
  return {
    maxAttempts,
    backoff: record.backoff === "EXPONENTIAL" ? "EXPONENTIAL" : "FIXED",
    initialDelaySeconds: initial,
    maxDelaySeconds: Math.max(initial, max),
    retryOn: Array.isArray(record.retryOn)
      ? record.retryOn.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
  };
}

/** How long to wait before `attempt` (1-based: attempt 2 is the first retry).
 * EXPONENTIAL doubles from the initial delay, capped both by the author's
 * `maxDelaySeconds` and by {@link MAX_RETRY_DELAY_MS}. */
export function retryDelayMs(
  retry: EffectiveRetryPolicy,
  attempt: number,
): number {
  const initial = retry.initialDelaySeconds * 1000;
  const raw =
    retry.backoff === "EXPONENTIAL"
      ? initial * 2 ** Math.max(0, attempt - 2)
      : initial;
  return Math.max(
    0,
    Math.min(raw, retry.maxDelaySeconds * 1000, MAX_RETRY_DELAY_MS),
  );
}

/**
 * Whether `retryOn` admits this error.
 *
 * The schema calls its entries "error classes", which in a workflow is a loose
 * notion: a piece throws whatever it likes, and what reaches here may be an
 * `Error` subclass of the engine's, an HTTP failure formatted by the piece
 * framework, or a string. So an entry matches the error's CLASS NAME exactly,
 * or appears anywhere in its message — case-insensitively in both cases. That
 * makes `["HostCallTimeoutError"]` and `["429"]` both work, which is what an
 * author writing one of these actually means.
 *
 * An EMPTY list admits everything. The schema's own reading ("everything else
 * fails terminally on attempt 1") would make the shipped default — an empty
 * `retryOn` — turn every `maxAttempts` into a lie, so empty is read as
 * "unrestricted" and a non-empty list as the filter it is.
 */
export function isRetryableError(
  retry: EffectiveRetryPolicy,
  error: unknown,
): boolean {
  if (retry.retryOn.length === 0) return true;
  const name = (error instanceof Error ? error.name : "").toLowerCase();
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return retry.retryOn.some((entry) => {
    const needle = entry.trim().toLowerCase();
    if (needle === "") return false;
    return needle === name || message.includes(needle);
  });
}
