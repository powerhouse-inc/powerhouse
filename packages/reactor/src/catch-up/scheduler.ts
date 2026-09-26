import type { ILogger } from "document-model";
import type { IOperationIndex } from "../cache/operation-index-types.js";
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
};

type PresentPage = { bound: number; present: number[] };

/** Periodically sweeps every consumer up to the settled watermark. */
export class CatchUpScheduler implements ICatchUp {
  private readonly entries: ConsumerEntry[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<SweepResult[]> | undefined;
  private started = false;
  private stopped = false;

  constructor(
    private readonly watermark: ISettledWatermark,
    private readonly operationIndex: IOperationIndex,
    private readonly config: CatchUpConfig,
    private readonly logger: ILogger,
    private readonly onSwept: (result: SweepResult) => void = () => {},
  ) {}

  get settledWatermark(): ISettledWatermark {
    return this.watermark;
  }

  addConsumer(consumer: ICatchUpConsumer, thread: CatchUpThread): void {
    if (this.entries.some((entry) => entry.consumer === consumer)) return;
    this.entries.push({ consumer, thread, lastAdvanceUtcMs: Date.now() });
    this.ensureTimer();
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
      consumers: this.entries.map((entry): CatchUpConsumerStatus => ({
        consumerId: entry.consumer.consumerId,
        thread: entry.thread,
        appliedThrough: entry.consumer.appliedThrough,
        trackedAbove: entry.consumer.trackedAbove,
        ...(entry.blockedAt !== undefined
          ? { blockedAt: entry.blockedAt }
          : {}),
        lastAdvanceUtcMs: entry.lastAdvanceUtcMs,
      })),
    };
  }

  private ensureTimer(): void {
    if (!this.started || this.stopped || this.timer !== undefined) return;
    if (this.entries.length === 0) return;

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
    if (this.entries.length === 0) return [];

    let lowest = Number.POSITIVE_INFINITY;
    for (const entry of this.entries) {
      lowest = Math.min(lowest, entry.consumer.appliedThrough);
    }
    const shared = await this.readPage(lowest, settled);

    const results: SweepResult[] = [];
    for (const entry of [...this.entries]) {
      if (this.stopped) break;
      const result = await this.sweepOne(entry, shared, settled);
      if (result !== undefined) results.push(result);
    }
    return results;
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

    if (result.to > result.from) entry.lastAdvanceUtcMs = Date.now();
    entry.blockedAt = result.blockedAt;
    this.onSwept(result);
    return result;
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
