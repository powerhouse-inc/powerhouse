import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  ProcessorTiming,
  ProcessorTimingBatch,
  ProcessorTimingCounters,
  ProcessorTimingHorizon,
  ProcessorTimingLastRun,
  ProcessorTimingLevel,
  ProcessorTimingPath,
  ProcessorTimingRun,
} from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";

export const PROCESSOR_TIMING_LEVELS = ["off", "basic", "detailed"] as const;
export const DEFAULT_PROCESSOR_TIMING_WINDOW_MS = 60_000;
export const DEFAULT_PROCESSOR_SLOW_BATCH_MS = 1_000;

const WINDOW_BUCKETS = 12;

export function isProcessorTimingLevel(
  value: unknown,
): value is ProcessorTimingLevel {
  return (PROCESSOR_TIMING_LEVELS as readonly unknown[]).includes(value);
}

export type ProcessorTimingOptions = {
  level?: ProcessorTimingLevel;
  /** The rolling horizon. */
  windowMs?: number;
  /** At `detailed`: an `onOperations` call over this logs a warning. */
  slowBatchMs?: number;
  /** Monotonic ms; injectable for tests. */
  now?: () => number;
  /** Epoch ms; injectable for tests. */
  utcNow?: () => number;
};

/**
 * What every processor queue records, shared by a manager's queues. Mutable, so
 * a host can change the level at runtime: at `off` the numbers so far are kept
 * and nothing is collected; back at `basic` they continue, and the window ages
 * them out.
 */
export class ProcessorTimingSettings {
  level: ProcessorTimingLevel;
  readonly windowMs: number;
  readonly slowBatchMs: number;
  readonly now: () => number;
  readonly utcNow: () => number;

  constructor(options: ProcessorTimingOptions = {}) {
    this.level = options.level ?? "off";
    this.windowMs = options.windowMs ?? DEFAULT_PROCESSOR_TIMING_WINDOW_MS;
    this.slowBatchMs = options.slowBatchMs ?? DEFAULT_PROCESSOR_SLOW_BATCH_MS;
    this.now = options.now ?? (() => performance.now());
    this.utcNow = options.utcNow ?? (() => Date.now());
  }
}

/** Who the stats belong to; refreshed when the same id binds again. */
export type ProcessorStatsIdentity = {
  processorId: string;
  name: string;
  driveLabel: string;
  factoryId: string;
  driveId: string;
};

function zeroCounters(): ProcessorTimingCounters {
  return {
    batches: 0,
    opsDelivered: 0,
    opsScanned: 0,
    opsMatched: 0,
    pages: 0,
    handlerMs: 0,
    maxBatchMs: 0,
    readMs: 0,
    lookupMs: 0,
    fillMs: 0,
    slotWaitMs: 0,
    pauseMs: 0,
    errors: 0,
  };
}

function zeroHorizon(): ProcessorTimingHorizon {
  return {
    live: zeroCounters(),
    replay: zeroCounters(),
    ordinalsAdvanced: 0,
    busyMs: 0,
  };
}

function busyOf(counters: ProcessorTimingCounters): number {
  return (
    counters.handlerMs + counters.readMs + counters.lookupMs + counters.fillMs
  );
}

function addCounters(
  into: ProcessorTimingCounters,
  from: ProcessorTimingCounters,
): void {
  into.batches += from.batches;
  into.opsDelivered += from.opsDelivered;
  into.opsScanned += from.opsScanned;
  into.opsMatched += from.opsMatched;
  into.pages += from.pages;
  into.handlerMs += from.handlerMs;
  into.maxBatchMs = Math.max(into.maxBatchMs, from.maxBatchMs);
  into.readMs += from.readMs;
  into.lookupMs += from.lookupMs;
  into.fillMs += from.fillMs;
  into.slotWaitMs += from.slotWaitMs;
  into.pauseMs += from.pauseMs;
  into.errors += from.errors;
}

function withBusy(horizon: ProcessorTimingHorizon): ProcessorTimingHorizon {
  return {
    live: { ...horizon.live },
    replay: { ...horizon.replay },
    ordinalsAdvanced: horizon.ordinalsAdvanced,
    busyMs: busyOf(horizon.live) + busyOf(horizon.replay),
  };
}

type TypeShare = { ops: number; handlerMs: number };

type Bucket = {
  index: number;
  horizon: ProcessorTimingHorizon;
  byType: Map<string, TypeShare>;
};

/** Numeric counters a hook adds to; the rest have their own recorders. */
type AddedCounter =
  | "opsScanned"
  | "opsMatched"
  | "pages"
  | "readMs"
  | "lookupMs"
  | "fillMs"
  | "slotWaitMs"
  | "pauseMs"
  | "errors";

/**
 * One processor's numbers over three horizons: since bind, a rolling window of
 * twelve buckets, and the current replay. Everything is recorded per page or
 * per batch, never per operation. The hooks read the level first, so at `off`
 * they cost one property read and never read a clock.
 *
 * The one delivery not recorded is the owed drive deletion the manager hands a
 * processor directly: one operation per deleted drive.
 */
export class ProcessorStats {
  private readonly total: ProcessorTimingHorizon = zeroHorizon();
  private readonly buckets = new Map<number, Bucket>();
  private currentRun: ProcessorTimingRun | undefined;
  private runStartedAt = 0;
  private lastRun: ProcessorTimingLastRun | undefined;
  private lastBatch: ProcessorTimingBatch | undefined;
  private sinceUtcMs: number;
  private startedAt: number;
  private identity: ProcessorStatsIdentity;

  constructor(
    private readonly settings: ProcessorTimingSettings,
    identity: ProcessorStatsIdentity,
    private readonly logger: ILogger | undefined = undefined,
  ) {
    this.identity = identity;
    this.sinceUtcMs = settings.utcNow();
    this.startedAt = settings.now();
  }

  /** Stats that never collect, for a queue no manager owns. */
  static disabled(processorId: string): ProcessorStats {
    return new ProcessorStats(new ProcessorTimingSettings(), {
      processorId,
      name: processorId,
      driveLabel: "",
      factoryId: "",
      driveId: "",
    });
  }

  get name(): string {
    return this.identity.name;
  }

  rebind(identity: ProcessorStatsIdentity): void {
    this.identity = identity;
  }

  /** The clock now, or -1 while off; a recorder ignores a -1 mark. */
  mark(): number {
    return this.settings.level === "off" ? -1 : this.settings.now();
  }

  recordBatch(
    path: ProcessorTimingPath,
    mark: number,
    ops: readonly OperationWithContext[],
    failed: boolean,
  ): void {
    if (!this.collecting(mark)) return;
    const ms = this.settings.now() - mark;
    for (const counters of this.countersOf(path)) {
      counters.batches++;
      counters.handlerMs += ms;
      counters.maxBatchMs = Math.max(counters.maxBatchMs, ms);
      if (failed) counters.errors++;
      else counters.opsDelivered += ops.length;
    }
    let fromOrdinal = ops[0]?.context.ordinal ?? 0;
    let toOrdinal = fromOrdinal;
    for (const op of ops) {
      fromOrdinal = Math.min(fromOrdinal, op.context.ordinal);
      toOrdinal = Math.max(toOrdinal, op.context.ordinal);
    }
    this.lastBatch = {
      atUtcMs: this.settings.utcNow(),
      path,
      ops: ops.length,
      ms,
      fromOrdinal,
      toOrdinal,
    };
    if (this.settings.level === "detailed") {
      this.recordDetail(ops, ms, fromOrdinal, toOrdinal);
    }
  }

  recordRead(mark: number, scanned: number): void {
    if (!this.collecting(mark)) return;
    const ms = this.settings.now() - mark;
    for (const counters of this.countersOf("replay")) {
      counters.pages++;
      counters.readMs += ms;
      counters.opsScanned += scanned;
    }
  }

  recordLookup(path: ProcessorTimingPath, mark: number): void {
    this.addElapsed(path, "lookupMs", mark);
  }

  recordFill(mark: number): void {
    this.addElapsed("replay", "fillMs", mark);
  }

  recordSlotWait(mark: number): void {
    this.addElapsed("replay", "slotWaitMs", mark);
  }

  recordPause(mark: number): void {
    this.addElapsed("replay", "pauseMs", mark);
  }

  recordScanned(path: ProcessorTimingPath, ops: number): void {
    this.add(path, "opsScanned", ops);
  }

  recordMatched(path: ProcessorTimingPath, ops: number): void {
    this.add(path, "opsMatched", ops);
  }

  recordError(path: ProcessorTimingPath): void {
    this.add(path, "errors", 1);
  }

  recordAdvance(ordinals: number): void {
    if (this.settings.level === "off") return;
    this.total.ordinalsAdvanced += ordinals;
    this.bucket().horizon.ordinalsAdvanced += ordinals;
    if (this.currentRun) this.currentRun.ordinalsAdvanced += ordinals;
  }

  /** Opens a run unless one is open: replays queued together are one run. */
  startRun(runFrom: number): void {
    if (this.settings.level === "off" || this.currentRun) return;
    this.runStartedAt = this.settings.now();
    this.currentRun = {
      startedAtUtcMs: this.settings.utcNow(),
      runFrom,
      counters: zeroCounters(),
      ordinalsAdvanced: 0,
    };
  }

  /** Moves the run to `lastRun`; a run that found nothing to do leaves it. */
  endRun(): void {
    const run = this.currentRun;
    if (!run) return;
    this.currentRun = undefined;
    if (run.counters.pages === 0 && run.ordinalsAdvanced === 0) return;
    this.lastRun = {
      startedAtUtcMs: run.startedAtUtcMs,
      durationMs: this.settings.now() - this.runStartedAt,
      ordinals: run.ordinalsAdvanced,
      opsDelivered: run.counters.opsDelivered,
      busyMs: busyOf(run.counters),
    };
  }

  /** Zeroes every horizon; a run in progress keeps going from zero. */
  reset(): void {
    Object.assign(this.total, zeroHorizon());
    this.buckets.clear();
    if (this.currentRun) {
      this.currentRun.counters = zeroCounters();
      this.currentRun.ordinalsAdvanced = 0;
    }
    this.lastRun = undefined;
    this.lastBatch = undefined;
    this.sinceUtcMs = this.settings.utcNow();
    this.startedAt = this.settings.now();
  }

  /** Undefined while off, whatever was collected before. */
  snapshot(): ProcessorTiming | undefined {
    if (this.settings.level === "off") return undefined;
    const now = this.settings.now();
    const window = zeroHorizon();
    const byType = new Map<string, TypeShare>();
    const oldest = this.bucketIndex(now) - WINDOW_BUCKETS;
    for (const bucket of this.buckets.values()) {
      if (bucket.index <= oldest) continue;
      addCounters(window.live, bucket.horizon.live);
      addCounters(window.replay, bucket.horizon.replay);
      window.ordinalsAdvanced += bucket.horizon.ordinalsAdvanced;
      for (const [documentType, share] of bucket.byType) {
        const merged = byType.get(documentType);
        if (merged) {
          merged.ops += share.ops;
          merged.handlerMs += share.handlerMs;
        } else {
          byType.set(documentType, { ...share });
        }
      }
    }
    const { processorId, name, driveLabel, factoryId, driveId } = this.identity;
    return {
      processorId,
      name,
      driveLabel,
      factoryId,
      driveId,
      sinceUtcMs: this.sinceUtcMs,
      total: withBusy(this.total),
      window: withBusy(window),
      windowMs: Math.min(this.settings.windowMs, now - this.startedAt),
      currentRun: this.currentRun
        ? {
            ...this.currentRun,
            counters: { ...this.currentRun.counters },
          }
        : null,
      lastRun: this.lastRun ? { ...this.lastRun } : null,
      lastBatch: this.lastBatch ? { ...this.lastBatch } : null,
      byDocumentType: [...byType].map(([documentType, share]) => ({
        documentType,
        ...share,
      })),
    };
  }

  private collecting(mark: number): boolean {
    return mark >= 0 && this.settings.level !== "off";
  }

  private addElapsed(
    path: ProcessorTimingPath,
    counter: AddedCounter,
    mark: number,
  ): void {
    if (!this.collecting(mark)) return;
    this.add(path, counter, this.settings.now() - mark);
  }

  private add(
    path: ProcessorTimingPath,
    counter: AddedCounter,
    amount: number,
  ): void {
    if (this.settings.level === "off") return;
    for (const counters of this.countersOf(path)) counters[counter] += amount;
  }

  /** Total, window bucket, and the run while one is open and this is its path. */
  private countersOf(path: ProcessorTimingPath): ProcessorTimingCounters[] {
    const counters = [this.total[path], this.bucket().horizon[path]];
    if (path === "replay" && this.currentRun) {
      counters.push(this.currentRun.counters);
    }
    return counters;
  }

  private bucketIndex(now: number): number {
    return Math.floor(now / (this.settings.windowMs / WINDOW_BUCKETS));
  }

  private bucket(): Bucket {
    const index = this.bucketIndex(this.settings.now());
    const slot = index % WINDOW_BUCKETS;
    let bucket = this.buckets.get(slot);
    if (bucket?.index !== index) {
      bucket = { index, horizon: zeroHorizon(), byType: new Map() };
      this.buckets.set(slot, bucket);
    }
    return bucket;
  }

  private recordDetail(
    ops: readonly OperationWithContext[],
    ms: number,
    fromOrdinal: number,
    toOrdinal: number,
  ): void {
    const counts = new Map<string, number>();
    for (const op of ops) {
      const type = op.context.documentType;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    const { byType } = this.bucket();
    for (const [documentType, count] of counts) {
      const share = byType.get(documentType) ?? { ops: 0, handlerMs: 0 };
      share.ops += count;
      share.handlerMs += (ms * count) / ops.length;
      byType.set(documentType, share);
    }
    if (ms > this.settings.slowBatchMs) {
      this.logger?.warn(
        "Processor '@ProcessorId' took @Ms ms over @Count operation(s), ordinals @From-@To: @Types",
        this.identity.processorId,
        Math.round(ms),
        ops.length,
        fromOrdinal,
        toOrdinal,
        Object.fromEntries(counts),
      );
    }
  }
}
