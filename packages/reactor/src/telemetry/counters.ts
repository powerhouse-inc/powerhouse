import type { IEventBus } from "../events/interfaces.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
  type ReadModelIndexedEvent,
  type Unsubscribe,
} from "../events/types.js";
import type { MemoryCounters } from "./types.js";

function zeroCounters(): MemoryCounters {
  return {
    jobsEnqueued: 0,
    jobsReadReady: 0,
    jobsFailed: 0,
    opsWritten: 0,
    readModelBatches: 0,
    readModelOps: 0,
    catchUpSweeps: 0,
  };
}

/** Counts events only between `start` and `stop`, so off costs no subscription. */
export class TelemetryCounters {
  private counts = zeroCounters();
  private unsubscribers: Unsubscribe[] = [];

  constructor(private readonly eventBus: IEventBus | undefined) {}

  get values(): MemoryCounters {
    return { ...this.counts };
  }

  start(): void {
    const bus = this.eventBus;
    if (!bus || this.unsubscribers.length > 0) return;
    this.counts = zeroCounters();
    const { counts } = this;
    this.unsubscribers = [
      bus.subscribe(ReactorEventTypes.JOB_PENDING, () => {
        counts.jobsEnqueued++;
      }),
      bus.subscribe(ReactorEventTypes.JOB_READ_READY, () => {
        counts.jobsReadReady++;
      }),
      bus.subscribe(ReactorEventTypes.JOB_FAILED, () => {
        counts.jobsFailed++;
      }),
      bus.subscribe(
        ReactorEventTypes.JOB_WRITE_READY,
        (_type, event: JobWriteReadyEvent) => {
          counts.opsWritten += event.operations.length;
        },
      ),
      bus.subscribe(ReactorEventTypes.READMODEL_BATCH_COMPLETED, () => {
        counts.readModelBatches++;
      }),
      bus.subscribe(
        ReactorEventTypes.READMODEL_INDEXED,
        (_type, event: ReadModelIndexedEvent) => {
          counts.readModelOps += event.operationCount;
        },
      ),
      bus.subscribe(ReactorEventTypes.CATCHUP_SWEPT, () => {
        counts.catchUpSweeps++;
      }),
    ];
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }
}
