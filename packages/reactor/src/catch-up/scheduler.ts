import type { ILogger } from "document-model";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { WatermarkSession } from "./settled-watermark.js";
import type {
  CatchUpConfig,
  CatchUpConsumerStatus,
  CatchUpStatus,
  CatchUpThread,
  ICatchUp,
  ICatchUpConsumer,
  ISettledWatermark,
  SweepBlockedAt,
  SweepResult,
} from "./types.js";

type ConsumerEntry = {
  consumer: ICatchUpConsumer;
  thread: CatchUpThread;
  blockedAt?: SweepBlockedAt;
  lastAdvanceUtcMs: number;
  warnedHeld: boolean;
};

export type CatchUpSchedulerHooks = {
  /** Called for every sweep that moved, replayed or failed. */
  onSwept: (result: SweepResult, thread: CatchUpThread) => void;
  /** Names the sessions holding the watermark, for the stall warning. */
  describeSessions: (xids: readonly string[]) => Promise<WatermarkSession[]>;
};

const noHooks: CatchUpSchedulerHooks = {
  onSwept: () => {},
  describeSessions: () => Promise.resolve([]),
};

type PresentPage = { bound: number; present: number[] };

type ConsumerSource = {
  consumers: () => readonly ICatchUpConsumer[];
  thread: CatchUpThread;
};

export function isCatchUpConsumer(value: unknown): value is ICatchUpConsumer {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ICatchUpConsumer>;
  return (
    typeof candidate.sweep === "function" &&
    typeof candidate.consumerId === "string" &&
    typeof candidate.appliedThrough === "number"
  );
}

/** Periodically sweeps every consumer up to the settled watermark. */
export class CatchUpScheduler implements ICatchUp {
  private readonly fixed: ConsumerEntry[] = [];
  private readonly sources: ConsumerSource[] = [];
  private readonly sourced = new Map<ICatchUpConsumer, ConsumerEntry>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<SweepResult[]> | undefined;
  private started = false;
  private stopped = false;
  private warnedStallSince: number | undefined;
  private readonly statusSources: Array<() => CatchUpConsumerStatus[]> = [];

  constructor(
    private readonly watermark: ISettledWatermark,
    private readonly operationIndex: IOperationIndex,
    private readonly config: CatchUpConfig,
    private readonly logger: ILogger,
    private readonly hooks: CatchUpSchedulerHooks = noHooks,
  ) {}

  get settledWatermark(): ISettledWatermark {
    return this.watermark;
  }

  addConsumer(consumer: ICatchUpConsumer, thread: CatchUpThread): void {
    if (this.fixed.some((entry) => entry.consumer === consumer)) return;
    this.fixed.push({
      consumer,
      thread,
      lastAdvanceUtcMs: Date.now(),
      warnedHeld: false,
    });
    this.ensureTimer();
  }

  /** Consumers read on every tick, so models registered later are swept too. */
  addSource(
    consumers: () => readonly ICatchUpConsumer[],
    thread: CatchUpThread,
  ): void {
    this.sources.push({ consumers, thread });
    this.ensureTimer();
  }

  /** Consumers another thread sweeps, reported in status(). */
  addStatusSource(source: () => CatchUpConsumerStatus[]): void {
    this.statusSources.push(source);
  }

  start(): void {
    this.started = true;
    this.ensureTimer();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.running !== undefined) {
      await this.running.catch(() => []);
    }
  }

  async sweepNow(): Promise<SweepResult[]> {
    if (this.running !== undefined) {
      await this.running.catch(() => []);
    }
    return this.run();
  }

  status(): CatchUpStatus {
    return {
      watermark: this.watermark.status(),
      consumers: this.entries()
        .map((entry): CatchUpConsumerStatus => ({
          consumerId: entry.consumer.consumerId,
          thread: entry.thread,
          appliedThrough: entry.consumer.appliedThrough,
          trackedAbove: entry.consumer.trackedAbove,
          ...(entry.blockedAt !== undefined
            ? { blockedAt: entry.blockedAt }
            : {}),
          lastAdvanceUtcMs: entry.lastAdvanceUtcMs,
        }))
        .concat(this.statusSources.flatMap((source) => source())),
    };
  }

  private ensureTimer(): void {
    if (!this.started || this.stopped || this.timer !== undefined) return;
    if (this.fixed.length === 0 && this.sources.length === 0) return;

    const timer = setInterval(() => {
      if (this.running !== undefined) return;
      void this.run().catch((error: unknown) => {
        this.logger.error("catch-up tick failed: @error", error);
      });
    }, this.config.intervalMs);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    this.timer = timer;
  }

  private run(): Promise<SweepResult[]> {
    const run = this.tick().finally(() => {
      if (this.running === run) this.running = undefined;
    });
    this.running = run;
    return run;
  }

  private async tick(): Promise<SweepResult[]> {
    const settled = await this.watermark.refresh();
    await this.warnIfWatermarkHeld();
    const entries = this.entries();
    if (entries.length === 0) return [];

    let lowest = Number.POSITIVE_INFINITY;
    for (const entry of entries) {
      lowest = Math.min(lowest, entry.consumer.appliedThrough);
    }
    const shared = await this.readPage(lowest, settled);

    const results: SweepResult[] = [];
    for (const entry of entries) {
      if (this.stopped) break;
      const result = await this.sweepOne(entry, shared, settled);
      if (result !== undefined) results.push(result);
    }
    return results;
  }

  private entries(): ConsumerEntry[] {
    const entries = [...this.fixed];
    const seen = new Set(entries.map((entry) => entry.consumer));
    for (const source of this.sources) {
      for (const consumer of source.consumers()) {
        if (seen.has(consumer)) continue;
        seen.add(consumer);
        let entry = this.sourced.get(consumer);
        if (entry === undefined) {
          entry = {
            consumer,
            thread: source.thread,
            lastAdvanceUtcMs: Date.now(),
            warnedHeld: false,
          };
          this.sourced.set(consumer, entry);
        }
        entries.push(entry);
      }
    }
    return entries;
  }

  private async sweepOne(
    entry: ConsumerEntry,
    shared: PresentPage,
    settled: number,
  ): Promise<SweepResult | undefined> {
    const applied = entry.consumer.appliedThrough;
    let page = shared;
    if (applied >= shared.bound && shared.bound < settled) {
      try {
        page = await this.readPage(applied, settled);
      } catch (error) {
        this.logger.error(
          "@consumer catch-up could not read present ordinals: @error",
          entry.consumer.consumerId,
          error,
        );
        return undefined;
      }
    }

    let result: SweepResult;
    try {
      result = await entry.consumer.sweep(page.bound, page.present);
    } catch (error) {
      this.logger.error(
        "@consumer catch-up sweep failed: @error",
        entry.consumer.consumerId,
        error,
      );
      return undefined;
    }

    if (result.to > result.from) {
      entry.lastAdvanceUtcMs = Date.now();
      entry.warnedHeld = false;
    }
    entry.blockedAt = result.blockedAt;
    this.warnIfConsumerHeld(entry, settled);
    if (
      result.to > result.from ||
      result.replayed > 0 ||
      result.blockedAt !== undefined
    ) {
      this.hooks.onSwept(result, entry.thread);
    }
    return result;
  }

  private async warnIfWatermarkHeld(): Promise<void> {
    const status = this.watermark.status();
    const since = status.stalledSinceUtcMs;
    if (since === undefined) {
      this.warnedStallSince = undefined;
      return;
    }
    const heldMs = Date.now() - since;
    if (heldMs < this.config.stuckWarnMs || this.warnedStallSince === since) {
      return;
    }
    this.warnedStallSince = since;
    const sessions: WatermarkSession[] = await this.hooks
      .describeSessions(status.waitingOn)
      .catch(() => []);
    this.logger.warn(
      "settled watermark held at @settled (head @head) for @ms ms, waiting on xid @xids: @sessions",
      status.settledThrough,
      status.head,
      heldMs,
      status.waitingOn.join(", "),
      sessions
        .map(
          (session) =>
            `pid ${session.pid} ${session.applicationName} ${session.state} since ${session.xactStart ?? "?"}`,
        )
        .join("; "),
    );
  }

  private warnIfConsumerHeld(entry: ConsumerEntry, settled: number): void {
    const applied = entry.consumer.appliedThrough;
    if (applied >= settled || entry.warnedHeld) return;
    const heldMs = Date.now() - entry.lastAdvanceUtcMs;
    if (heldMs < this.config.stuckWarnMs) return;
    entry.warnedHeld = true;
    this.logger.warn(
      "@consumer cursor held at @applied for @ms ms (settled @settled)",
      entry.consumer.consumerId,
      applied,
      heldMs,
      settled,
    );
  }

  private async readPage(after: number, settled: number): Promise<PresentPage> {
    const limit = this.config.sweepPageSize;
    const present = await this.operationIndex.getOrdinalsInRange(
      after,
      settled,
      limit,
    );
    const bound =
      present.length >= limit ? present[present.length - 1]! : settled;
    return { bound, present };
  }
}
