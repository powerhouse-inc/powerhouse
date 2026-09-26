import type { Unsubscribe } from "../events/types.js";

export type WatermarkStatus = {
  head: number;
  settledThrough: number;
  waitingOn: string[];
  stalledSinceUtcMs?: number;
};

export interface ISettledWatermark {
  /** Every ordinal at or below this is visible or will never exist. */
  readonly settledThrough: number;
  /** Probes, coalesced with one in flight; resolves with settledThrough. */
  refresh(signal?: AbortSignal): Promise<number>;
  onAdvance(listener: (settledThrough: number) => void): Unsubscribe;
  status(): WatermarkStatus;
}

export type SweepBlockedAt = {
  ordinal: number;
  documentId: string;
  scope: string;
  branch: string;
  type: string;
  error: string;
};

export type SweepResult = {
  consumerId: string;
  from: number;
  to: number;
  durationMs: number;
  /** Late operations applied. */
  replayed: number;
  /** Later operations of their streams applied again. */
  reapplied: number;
  blockedAt?: SweepBlockedAt;
};

export interface ICatchUpConsumer {
  readonly consumerId: string;
  readonly appliedThrough: number;
  /** Ordinals above the cursor this consumer holds in memory. */
  readonly trackedAbove: number;
  sweep(
    settledThrough: number,
    present: readonly number[],
    signal?: AbortSignal,
  ): Promise<SweepResult>;
}

export type CatchUpThread = "host" | "projection";

export type CatchUpConsumerStatus = {
  consumerId: string;
  thread: CatchUpThread;
  appliedThrough: number;
  trackedAbove: number;
  blockedAt?: SweepBlockedAt;
  lastAdvanceUtcMs: number;
};

export type CatchUpStatus = {
  watermark: WatermarkStatus;
  consumers: CatchUpConsumerStatus[];
};

export type CatchUpConfig = {
  intervalMs: number;
  stuckWarnMs: number;
  maxTrackedAboveCursor: number;
  /** Present ordinals read per tick. */
  sweepPageSize: number;
};

export const defaultCatchUpConfig: CatchUpConfig = {
  intervalMs: 2000,
  stuckWarnMs: 60_000,
  maxTrackedAboveCursor: 100_000,
  sweepPageSize: 10_000,
};

/** The catch-up surface a reactor module exposes. */
export interface ICatchUp {
  status(): CatchUpStatus;
  sweepNow(): Promise<SweepResult[]>;
}
