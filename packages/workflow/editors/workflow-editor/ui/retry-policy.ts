import type { RetryPolicyModel } from "./model.js";

// Mirrors the coordinator's MAX_STEP_ATTEMPTS and MAX_RETRY_DELAY_MS clamps.
export const MAX_STEP_ATTEMPTS = 10;
export const MAX_RETRY_DELAY_SECONDS = 300;

export const DEFAULT_RETRY: RetryPolicyModel = {
  maxAttempts: 3,
  backoff: "EXPONENTIAL",
  initialDelaySeconds: 5,
  maxDelaySeconds: MAX_RETRY_DELAY_SECONDS,
  retryOn: [],
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

// Clamps a policy to what the runtime runs, so the form shows what executes.
export function normalizeRetry(policy: RetryPolicyModel): RetryPolicyModel {
  const initialDelaySeconds = clampInt(
    policy.initialDelaySeconds,
    0,
    MAX_RETRY_DELAY_SECONDS,
  );
  return {
    maxAttempts: clampInt(policy.maxAttempts, 1, MAX_STEP_ATTEMPTS),
    backoff: policy.backoff === "EXPONENTIAL" ? "EXPONENTIAL" : "FIXED",
    initialDelaySeconds,
    maxDelaySeconds: clampInt(
      policy.maxDelaySeconds,
      initialDelaySeconds,
      MAX_RETRY_DELAY_SECONDS,
    ),
    retryOn: policy.retryOn.map((entry) => entry.trim()).filter(Boolean),
  };
}

// What a step with no retry of its own inherits, as the runtime picks it: the
// workflow's default when it retries, else the action's. Null when neither.
export function inheritedRetryHint(
  workflowAttempts: number | undefined,
  actionAttempts: number | undefined,
): string | null {
  if (actionAttempts === undefined) return null;
  const workflow = clampInt(workflowAttempts ?? 1, 1, MAX_STEP_ATTEMPTS);
  if (workflow > 1) {
    return `The workflow's default retry (up to ${workflow} attempts) applies, not this action's.`;
  }
  const action = clampInt(actionAttempts, 1, MAX_STEP_ATTEMPTS);
  return action === 1
    ? "This action runs once unless the step sets a retry."
    : `This action makes up to ${action} attempts unless the step sets a retry.`;
}

export function parseRetryOn(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}
