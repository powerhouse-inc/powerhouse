import type {
  AttachmentReplicationState,
  AttachmentRetryPolicy,
} from "./types.js";

/** setTimeout's largest delay; a longer one fires at once. */
export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/** One hash's retry bookkeeping; changed only by the functions below. */
export type RetryEntry = {
  /** Cumulative until resetRetry; an expired pending counts as one. */
  notFoundAnswers: number;
  /** Per run: errors since the last answer (pending, not-found or data). */
  errorRun: number;
  /** Per run: pendings since the last non-pending outcome; backoff only. */
  pendingRun: number;
  /** While live, a not-found from another document is not terminal. */
  livePending: { documentId: string; untilMs: number } | undefined;
  /** Never answered through, oldest first; asked before `asked`. */
  unasked: readonly string[];
  /** Next to ask first; pending moves to the front, not-found to the back. */
  asked: readonly string[];
};

export type FetchOutcome =
  | { kind: "data" }
  | {
      kind: "pending";
      documentId: string;
      expiresAtUtc: string;
      retryAfterMs: number;
    }
  | { kind: "not-found"; documentId: string }
  | { kind: "error"; documentId: string }
  | { kind: "aborted" };

export type RetryState = "held" | "queued" | "waiting" | "not-found" | "failed";

export type RetryTransition = {
  entry: RetryEntry;
  state: RetryState;
  /** Set exactly when `state` is `waiting`. */
  delayMs: number | undefined;
};

export function newRetryEntry(documentId: string): RetryEntry {
  return {
    notFoundAnswers: 0,
    errorRun: 0,
    pendingRun: 0,
    livePending: undefined,
    unasked: [documentId],
    asked: [],
  };
}

/** The document the next attempt asks through. */
export function documentToAsk(entry: RetryEntry): string | undefined {
  return entry.unasked[0] ?? entry.asked[0];
}

/** Every counter zeroed and every document unasked again. */
export function resetRetry(documentIds: readonly string[]): RetryEntry {
  return {
    notFoundAnswers: 0,
    errorRun: 0,
    pendingRun: 0,
    livePending: undefined,
    unasked: [...documentIds],
    asked: [],
  };
}

/** `revive`: a terminal entry earns one more attempt through the new document. */
export function withDocument(
  entry: RetryEntry,
  documentId: string,
  state: AttachmentReplicationState,
): { entry: RetryEntry; revive: boolean } {
  return {
    entry: { ...entry, unasked: [...entry.unasked, documentId] },
    revive: state === "not-found" || state === "failed",
  };
}

/** The whole retry policy; `now` is epoch ms. */
export function nextAfter(
  entry: RetryEntry,
  outcome: FetchOutcome,
  now: number,
  policy: AttachmentRetryPolicy,
): RetryTransition {
  switch (outcome.kind) {
    case "data":
      return {
        entry: { ...entry, errorRun: 0, pendingRun: 0, livePending: undefined },
        state: "held",
        delayMs: undefined,
      };
    case "aborted":
      return { entry, state: "queued", delayMs: undefined };
    case "pending": {
      const untilMs =
        typeof outcome.expiresAtUtc === "string"
          ? Date.parse(outcome.expiresAtUtc)
          : Number.NaN;
      if (!(untilMs > now)) {
        return notFound(entry, outcome.documentId, now, policy);
      }
      const pendingRun = entry.pendingRun + 1;
      return {
        entry: {
          ...entry,
          errorRun: 0,
          pendingRun,
          livePending: { documentId: outcome.documentId, untilMs },
          unasked: without(entry.unasked, outcome.documentId),
          asked: [
            outcome.documentId,
            ...without(entry.asked, outcome.documentId),
          ],
        },
        state: "waiting",
        delayMs: pendingDelay(outcome.retryAfterMs, pendingRun, policy),
      };
    }
    case "not-found":
      return notFound(entry, outcome.documentId, now, policy);
    case "error": {
      const errorRun = entry.errorRun + 1;
      if (errorRun < policy.errorAttempts) {
        return {
          entry: { ...entry, errorRun, pendingRun: 0 },
          state: "waiting",
          delayMs: backoff(policy.errorRetryMs, errorRun),
        };
      }
      const next: RetryEntry = {
        ...entry,
        errorRun,
        pendingRun: 0,
        unasked: without(entry.unasked, outcome.documentId),
        asked: entry.asked.includes(outcome.documentId)
          ? entry.asked
          : [...entry.asked, outcome.documentId],
      };
      if (next.unasked.length > 0) {
        return {
          entry: next,
          state: "waiting",
          delayMs: backoff(policy.errorRetryMs, errorRun),
        };
      }
      return { entry: next, state: "failed", delayMs: undefined };
    }
  }
}

function notFound(
  entry: RetryEntry,
  documentId: string,
  now: number,
  policy: AttachmentRetryPolicy,
): RetryTransition {
  const notFoundAnswers = entry.notFoundAnswers + 1;
  const livePending =
    entry.livePending &&
    entry.livePending.documentId !== documentId &&
    entry.livePending.untilMs > now
      ? entry.livePending
      : undefined;
  const next: RetryEntry = {
    ...entry,
    notFoundAnswers,
    errorRun: 0,
    pendingRun: 0,
    livePending,
    unasked: without(entry.unasked, documentId),
    asked: [...without(entry.asked, documentId), documentId],
  };
  if (
    notFoundAnswers < policy.notFoundAttempts ||
    next.unasked.length > 0 ||
    livePending !== undefined
  ) {
    return {
      entry: next,
      state: "waiting",
      delayMs: backoff(policy.notFoundRetryMs, notFoundAnswers),
    };
  }
  return { entry: next, state: "not-found", delayMs: undefined };
}

function pendingDelay(
  retryAfterMs: number,
  pendingRun: number,
  policy: AttachmentRetryPolicy,
): number {
  const asked =
    Number.isFinite(retryAfterMs) && retryAfterMs >= 0
      ? retryAfterMs
      : policy.pendingRetryMs;
  const base = Math.max(asked, policy.minPendingRetryMs);
  const grown = Math.min(
    base * 2 ** (pendingRun - 1),
    policy.maxPendingRetryMs,
  );
  return Math.min(
    Math.max(grown, policy.minPendingRetryMs),
    MAX_TIMER_DELAY_MS,
  );
}

function backoff(baseMs: number, run: number): number {
  return Math.min(baseMs * 2 ** (run - 1), MAX_TIMER_DELAY_MS);
}

function without(list: readonly string[], item: string): string[] {
  return list.filter((entry) => entry !== item);
}
