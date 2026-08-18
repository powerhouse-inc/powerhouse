import type { AttachmentProgress } from "@powerhousedao/reactor-attachments/client";

/**
 * Progress in both units. `percent` is the house unit (0-100, matching
 * `FileUploadProgress.progress` and design-system's progress bar); the raw
 * byte counts travel alongside so a caller can render "3.2 / 10 MB" without
 * reversing the arithmetic.
 *
 * Nesting them in an object is deliberate: the hook used to return a bare
 * 0..1 `progress` number, a third convention nobody noticed because nothing
 * consumed it. Any future call site now fails to compile rather than
 * silently scaling by 100.
 */
export type AttachmentProgressState = {
  /** 0-100. Always 0 while `indeterminate`, since no position is known. */
  percent: number;
  loaded: number;
  total: number | undefined;
  indeterminate: boolean;
};

export const IDLE_PROGRESS: AttachmentProgressState = {
  percent: 0,
  loaded: 0,
  total: undefined,
  indeterminate: false,
};

export function toProgressState(
  progress: AttachmentProgress,
): AttachmentProgressState {
  return {
    percent: toPercent(progress),
    loaded: progress.loaded,
    total: progress.total,
    indeterminate: progress.indeterminate,
  };
}

function toPercent(progress: AttachmentProgress): number {
  if (progress.indeterminate) return 0;
  if (progress.total === undefined) return 0;
  // A zero total moved everything there was to move — the dedup case.
  if (progress.total === 0) return 100;
  const percent = (progress.loaded / progress.total) * 100;
  if (percent < 0) return 0;
  return percent > 100 ? 100 : percent;
}

/** Terminal frame for a transfer of `total` bytes, written on resolution. */
export function doneProgress(total: number): AttachmentProgressState {
  return { percent: 100, loaded: total, total, indeterminate: false };
}

/** Default time budget for committing indeterminate ticks, in ms. */
export const INDETERMINATE_COMMIT_MS = 150;

export type ProgressGate = (progress: AttachmentProgress) => boolean;

/**
 * Second coalescer, on top of the client's time throttle, keyed on what
 * actually changed for a UI rather than on elapsed time:
 *
 * - a determinate tick commits only when the whole percent changes, capping
 *   commits at ~101 per transfer no matter how many byte events arrive;
 * - an indeterminate tick has no percent to change, so it falls back to a time
 *   budget — otherwise a byte counter with no denominator would never update;
 * - a stage change always commits, because the label changed.
 *
 * Uses `Date.now()` so tests can drive it with fake timers.
 */
export function createProgressGate(options?: {
  indeterminateCommitMs?: number;
  now?: () => number;
}): ProgressGate {
  const budget = options?.indeterminateCommitMs ?? INDETERMINATE_COMMIT_MS;
  const now = options?.now ?? (() => Date.now());

  let lastStage: string | undefined;
  let lastPercent = -1;
  let lastCommitAt = Number.NEGATIVE_INFINITY;

  return (progress) => {
    const commit = () => {
      lastStage = progress.stage;
      lastPercent = Math.floor(toPercent(progress));
      lastCommitAt = now();
      return true;
    };

    if (progress.stage !== lastStage) return commit();
    if (progress.indeterminate) {
      return now() - lastCommitAt >= budget ? commit() : false;
    }
    return Math.floor(toPercent(progress)) !== lastPercent ? commit() : false;
  };
}
