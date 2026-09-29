import {
  EventBus,
  ReactorEventTypes,
  type CatchUpStatus,
  type CatchUpSweptEvent,
  type InProcessReactorModule,
} from "@powerhousedao/reactor";
import { metrics } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type MetricData,
} from "@opentelemetry/sdk-metrics";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReactorInstrumentation } from "../src/instrumentation.js";

const STATUS: CatchUpStatus = {
  watermark: { head: 120, settledThrough: 100, waitingOn: ["901"] },
  consumers: [
    {
      consumerId: "document-view",
      thread: "projection",
      appliedThrough: 90,
      trackedAbove: 4,
      lastAdvanceUtcMs: 0,
    },
    {
      consumerId: "processor-manager",
      thread: "host",
      appliedThrough: 100,
      trackedAbove: 0,
      lastAdvanceUtcMs: 0,
    },
  ],
};

function fakeModule(eventBus: EventBus): InProcessReactorModule {
  return {
    eventBus,
    queue: { totalSize: () => Promise.resolve(0) },
    executorManager: { getStatus: () => ({ activeJobs: 0 }) },
    readModelCoordinator: { getChainDepth: () => 0 },
    syncModule: undefined,
    pools: [],
    catchUp: { status: () => STATUS, sweepNow: () => Promise.resolve([]) },
  } as unknown as InProcessReactorModule;
}

describe("read-side catch-up metrics", () => {
  let provider: MeterProvider;
  let reader: PeriodicExportingMetricReader;
  let instrumentation: ReactorInstrumentation;
  let eventBus: EventBus;

  beforeEach(() => {
    reader = new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
      exportIntervalMillis: 3_600_000,
    });
    provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);
    eventBus = new EventBus();
    instrumentation = new ReactorInstrumentation(fakeModule(eventBus));
    instrumentation.start();
  });

  afterEach(async () => {
    instrumentation.stop();
    await provider.shutdown();
    metrics.disable();
  });

  async function collected(): Promise<Map<string, MetricData>> {
    const { resourceMetrics } = await reader.collect();
    const byName = new Map<string, MetricData>();
    for (const scope of resourceMetrics.scopeMetrics) {
      for (const metric of scope.metrics) {
        byName.set(metric.descriptor.name, metric);
      }
    }
    return byName;
  }

  function values(metric: MetricData | undefined) {
    return (metric?.dataPoints ?? []).map((point) => ({
      attributes: point.attributes,
      value: point.value,
    }));
  }

  it("records the seven catch-up metrics", async () => {
    const swept: CatchUpSweptEvent = {
      consumerId: "document-view",
      thread: "projection",
      from: 80,
      to: 90,
      durationMs: 12,
      replayed: 3,
      reapplied: 1,
      blockedAt: {
        ordinal: 91,
        documentId: "doc-1",
        scope: "global",
        branch: "main",
        type: "SET_NAME",
        error: "boom",
      },
    };
    await eventBus.emit(ReactorEventTypes.CATCHUP_SWEPT, swept);

    const byName = await collected();
    const attributes = { consumer: "document-view", thread: "projection" };

    expect(values(byName.get("reactor.catchup.sequence_head"))).toEqual([
      { attributes: {}, value: 120 },
    ]);
    expect(values(byName.get("reactor.catchup.settled_through"))).toEqual([
      { attributes: {}, value: 100 },
    ]);
    expect(values(byName.get("reactor.catchup.settle_lag"))).toEqual([
      { attributes: {}, value: 20 },
    ]);
    expect(values(byName.get("reactor.catchup.consumer_lag"))).toEqual([
      { attributes, value: 10 },
      {
        attributes: { consumer: "processor-manager", thread: "host" },
        value: 0,
      },
    ]);
    expect(values(byName.get("reactor.catchup.sweep.replayed"))).toEqual([
      { attributes, value: 3 },
    ]);
    expect(values(byName.get("reactor.catchup.sweep.failures"))).toEqual([
      { attributes, value: 1 },
    ]);
    const duration = byName.get("reactor.catchup.sweep.duration");
    expect(duration?.dataPoints[0]?.attributes).toEqual(attributes);
    expect(duration?.dataPoints[0]?.value).toMatchObject({ count: 1, sum: 12 });
  });
});
