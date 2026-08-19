/**
 * Byte-level progress for attachment transfers.
 *
 * `loaded`/`total` are per-stage, never per-operation. A per-operation
 * denominator would have to weight hashing against transfer, and a confirmed
 * dedup would shrink it mid-flight from 2N to N — the bar would run backwards.
 * Choosing that weighting is a UI decision the client cannot make.
 */

export type AttachmentStage =
  | "hashing"
  | "reserving"
  | "uploading"
  | "requesting-download-target"
  | "downloading"
  | "done"
  | "error";

export type AttachmentProgress = {
  stage: AttachmentStage;
  /** Bytes moved so far within `stage`. */
  loaded: number;
  /** Denominator for `stage`: file.size for uploads, header.sizeBytes for downloads. */
  total: number | undefined;
  /** True when the stage is running but bytes cannot (yet) be observed. */
  indeterminate: boolean;
  /** Only on a terminal `done` where dedup skipped the transfer entirely. */
  deduped?: true;
};

export type AttachmentProgressListener = (progress: AttachmentProgress) => void;

export type AttachmentProgressOptions = {
  onProgress?: AttachmentProgressListener;
  /** Min ms between byte events within a stage. Default 100. 0 emits every observation. */
  throttleMs?: number;
};

export const DEFAULT_PROGRESS_THROTTLE_MS = 100;

/**
 * Fraction in 0..1 for a progress event. Indeterminate and unknown-total
 * events read as 0 — a bar cannot honestly show a position it does not know.
 * A zero total is complete by definition (the dedup case moves no bytes).
 */
export function progressFraction(progress: AttachmentProgress): number {
  if (progress.indeterminate) return 0;
  if (progress.total === undefined) return 0;
  if (progress.total === 0) return 1;
  const fraction = progress.loaded / progress.total;
  if (fraction < 0) return 0;
  return fraction > 1 ? 1 : fraction;
}

export type ProgressEmitterOptions = AttachmentProgressOptions & {
  /** Injected clock so throttle tests stay synchronous. */
  now?: () => number;
};

/**
 * Emits `AttachmentProgress` for one single-item operation, upholding:
 *
 * - **I1** exactly one terminal event (`done` or `error`) — never both, never twice.
 * - **I2** on `done`: `indeterminate === false`, `total` is a number, `loaded === total`.
 * - **I3** `loaded` is non-decreasing within a stage and resets to 0 on stage change.
 * - **I4** the terminal event bypasses the throttle unconditionally.
 * - **I5** `error` carries the last known `loaded`/`total`.
 *
 * Leading edge: the first `bytes()` after a `stage()` always emits, so a bar
 * leaves 0 immediately. There is deliberately no trailing-edge timer — it
 * would leak on throw, could fire after the terminal event and violate I1's
 * ordering, and is unnecessary because `finish()` always emits
 * `loaded === total`, making a dropped last intra-stage tick invisible.
 */
export class ProgressEmitter {
  private readonly listener: AttachmentProgressListener | undefined;
  private readonly throttleMs: number;
  private readonly now: () => number;

  private currentStage: AttachmentStage | undefined;
  private loaded = 0;
  private total: number | undefined;
  private emittedBytesInStage = false;
  private lastEmitAt = Number.NEGATIVE_INFINITY;
  private settled = false;

  constructor(options?: ProgressEmitterOptions) {
    this.listener = options?.onProgress;
    this.throttleMs = options?.throttleMs ?? DEFAULT_PROGRESS_THROTTLE_MS;
    this.now = options?.now ?? (() => Date.now());
  }

  /** True when a listener is attached; lets callers skip instrumentation entirely. */
  get active(): boolean {
    return this.listener !== undefined;
  }

  /**
   * Enter a stage. Always emits and resets `loaded` to 0. Entry is always
   * indeterminate: no bytes have moved yet, and whether they can be observed
   * at all is only proven by a transport actually calling back.
   */
  stage(stage: AttachmentStage, options?: { total?: number }): void {
    if (this.settled) return;
    this.currentStage = stage;
    this.loaded = 0;
    this.total = options?.total;
    this.emittedBytesInStage = false;
    this.emit({
      stage,
      loaded: 0,
      total: this.total,
      indeterminate: true,
    });
  }

  /**
   * Report observed bytes within the current stage. Throttled by time, with
   * the first observation after a stage change always emitted.
   */
  bytes(loaded: number, total?: number): void {
    if (this.settled || this.currentStage === undefined) return;
    if (total !== undefined) this.total = total;
    if (loaded > this.loaded) this.loaded = loaded;

    const leadingEdge = !this.emittedBytesInStage;
    if (!leadingEdge && this.now() - this.lastEmitAt < this.throttleMs) return;
    this.emittedBytesInStage = true;
    this.emit({
      stage: this.currentStage,
      loaded: this.loaded,
      total: this.total,
      indeterminate: false,
    });
  }

  /**
   * Terminal success. `total` defaults to the bytes actually seen so a stage
   * with no known denominator still satisfies I2.
   */
  finish(override?: { loaded?: number; total?: number; deduped?: true }): void {
    if (this.settled) return;
    this.settled = true;
    const total = override?.total ?? this.total ?? this.loaded;
    const loaded = override?.loaded ?? total;
    this.emit({
      stage: "done",
      loaded,
      total,
      indeterminate: false,
      ...(override?.deduped ? { deduped: true as const } : {}),
    });
  }

  /** Terminal success for a confirmed dedup: no bytes moved, and none needed to. */
  finishDeduped(): void {
    this.finish({ loaded: 0, total: 0, deduped: true });
  }

  /** Terminal failure, carrying the last known byte counts. */
  fail(): void {
    if (this.settled) return;
    this.settled = true;
    this.emit({
      stage: "error",
      loaded: this.loaded,
      total: this.total,
      indeterminate: false,
    });
  }

  private emit(progress: AttachmentProgress): void {
    this.lastEmitAt = this.now();
    this.listener?.(progress);
  }
}

export type ByteProgressHooks = {
  /** Cumulative bytes handed to the consumer. */
  onBytes?: (loaded: number) => void;
  /** The source ended and every byte reached the consumer. */
  onDone?: () => void;
  onError?: (error: unknown) => void;
};

/**
 * Count bytes as a consumer reads them.
 *
 * Uses the manual-reader form rather than `pipeThrough`, whose internal queue
 * reads far ahead of the consumer and would make `loaded` overstate what was
 * actually received. `highWaterMark: 0` is load-bearing for the same reason:
 * at the default of 1 the wrapper pulls one chunk the instant it is
 * constructed, so a caller who never reads still sees bytes counted.
 *
 * `cancel` propagates to the source, which is what keeps reader refcounts
 * (e.g. `KyselyAttachmentStore`'s) correct. Cancelling is an abandonment, not
 * a completion, so it reports `onError` — never `onDone` — carrying the
 * cancel reason the way an `AbortSignal` carries its own, with the DOM's
 * default `AbortError` when the canceller gave none.
 *
 * Returns `source` unchanged when no hook is supplied, so a caller with no
 * listener pays nothing.
 */
export function withByteProgress(
  source: ReadableStream<Uint8Array>,
  hooks: ByteProgressHooks,
): ReadableStream<Uint8Array> {
  if (!hooks.onBytes && !hooks.onDone && !hooks.onError) return source;

  let loaded = 0;
  let cancelled = false;
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          // A cancel that lands while this read is in flight resolves it as
          // `done`, and closes the stream. Bailing out here is what stops an
          // abandoned transfer from reporting completion, and stops the
          // already-closed controller from throwing a fabricated error into
          // the catch below.
          if (cancelled) return;
          if (done) {
            hooks.onDone?.();
            controller.close();
            return;
          }
          loaded += value.byteLength;
          hooks.onBytes?.(loaded);
          controller.enqueue(value);
        } catch (err) {
          if (cancelled) return;
          hooks.onError?.(err);
          controller.error(err);
        }
      },
      cancel(reason) {
        cancelled = true;
        reader.cancel(reason).catch(() => {});
        hooks.onError?.(reason ?? abortError());
      },
    },
    { highWaterMark: 0 },
  );
}

/** What an `AbortSignal` carries when `abort()` is called with no reason. */
function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}
