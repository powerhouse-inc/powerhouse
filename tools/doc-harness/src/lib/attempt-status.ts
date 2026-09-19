/** The attempt status matrix, kept pure so the table in the README is testable. */
import type {
  AttemptStatus,
  ClaudeFailureReason,
  ClaudeOutcome,
} from "./schemas.js";

export interface StatusInput {
  installOk: boolean;
  buildSkipped: boolean;
  buildOk: boolean;
  buildFailureReason: ClaudeFailureReason | null;
  contaminated: boolean;
}

/**
 * infra-fail: install failed. rate-limited: the builder was killed while the
 * CLI retried the API. build-fail: any other builder failure. contaminated:
 * the builder read outside its sandbox. complete: graded; truncated when the
 * builder ran out of budget first.
 */
export function attemptStatus(i: StatusInput): AttemptStatus {
  if (!i.installOk) return "infra-fail";
  if (i.buildSkipped) return "skipped";
  if (i.buildFailureReason === "rate-limited") return "rate-limited";
  if (!i.buildOk && !isTruncation(i.buildFailureReason)) return "build-fail";
  if (i.contaminated) return "contaminated";
  return "complete";
}

/** The CLI stopped the builder, but what it wrote is still worth grading. */
export function isTruncation(reason: ClaudeFailureReason | null): boolean {
  return reason === "budget-exhausted";
}

export function isTruncated(
  i: Pick<StatusInput, "buildOk" | "buildFailureReason">,
) {
  return !i.buildOk && isTruncation(i.buildFailureReason);
}

export function totalTokens(tokens: ClaudeOutcome["tokens"]): number | null {
  if (tokens === null) return null;
  return tokens.input + tokens.output + tokens.cacheCreation + tokens.cacheRead;
}

/** For log lines: cost when known, else the token count. */
export function costLabel(outcome: {
  costUsd: number | null;
  tokens: ClaudeOutcome["tokens"];
}): string {
  if (outcome.costUsd !== null) return `$${outcome.costUsd.toFixed(2)}`;
  const t = totalTokens(outcome.tokens);
  return t === null ? "cost=?" : `${formatTokens(t)} tok (unmetered)`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
