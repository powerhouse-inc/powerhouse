// Bench-host event-loop and CPU instrumentation. Registers OTel observable
// gauges on the global meter provider for monitorEventLoopDelay percentiles,
// performance.eventLoopUtilization, and process.cpuUsage. Pure observation;
// does not touch the reactor package. Imported and started from main.ts.
import {
  metrics,
  type BatchObservableCallback,
  type BatchObservableResult,
  type Observable,
} from "@opentelemetry/api";
import {
  monitorEventLoopDelay,
  performance,
  type EventLoopUtilization,
} from "node:perf_hooks";

const METER_NAME = "@powerhousedao/reactor-bench-host";
const DELAY_RESOLUTION_MS = 10;
const NS_PER_MS = 1_000_000;
const NS_PER_US = 1_000;

/**
 * Handle returned by registerEventLoopInstrumentation. Calling stop()
 * disables the underlying monitorEventLoopDelay histogram and removes
 * the batch observable callback from the meter.
 */
export type EventLoopInstrumentation = {
  stop(): void;
};

/**
 * Registers six observable gauges on the bench-host meter:
 *
 *   reactor.host.eventloop.delay.{p50,p95,p99,max}  (ms)
 *   reactor.host.eventloop.utilization              (ratio 0..1)
 *   reactor.host.cpu.utilization                    (ratio, >1 if multi-core)
 *
 * The monitorEventLoopDelay histogram is reset on each scrape so each sample
 * represents the delay distribution over the prior scrape window rather than
 * process-lifetime cumulative. ELU and CPU deltas are computed against a
 * cached previous snapshot, also windowed to the prior scrape interval.
 */
export function registerEventLoopInstrumentation(): EventLoopInstrumentation {
  const meter = metrics.getMeter(METER_NAME);

  const histogram = monitorEventLoopDelay({ resolution: DELAY_RESOLUTION_MS });
  histogram.enable();

  const delayP50 = meter.createObservableGauge(
    "reactor.host.eventloop.delay.p50",
    {
      description: "Event-loop callback delay p50 over the prior scrape window",
      unit: "ms",
    },
  );
  const delayP95 = meter.createObservableGauge(
    "reactor.host.eventloop.delay.p95",
    {
      description: "Event-loop callback delay p95 over the prior scrape window",
      unit: "ms",
    },
  );
  const delayP99 = meter.createObservableGauge(
    "reactor.host.eventloop.delay.p99",
    {
      description: "Event-loop callback delay p99 over the prior scrape window",
      unit: "ms",
    },
  );
  const delayMax = meter.createObservableGauge(
    "reactor.host.eventloop.delay.max",
    {
      description: "Event-loop callback delay max over the prior scrape window",
      unit: "ms",
    },
  );
  const utilization = meter.createObservableGauge(
    "reactor.host.eventloop.utilization",
    {
      description:
        "Event-loop utilization ratio (active / (active + idle)) over the prior scrape window",
      unit: "1",
    },
  );
  const cpuUtilization = meter.createObservableGauge(
    "reactor.host.cpu.utilization",
    {
      description:
        "Process CPU utilization over the prior scrape window. 1.0 = one core saturated.",
      unit: "1",
    },
  );

  let prevElu: EventLoopUtilization = performance.eventLoopUtilization();
  let prevCpu: NodeJS.CpuUsage = process.cpuUsage();
  let prevHrtime: bigint = process.hrtime.bigint();

  const callback: BatchObservableCallback = (result: BatchObservableResult) => {
    const p50ms = histogram.percentile(50) / NS_PER_MS;
    const p95ms = histogram.percentile(95) / NS_PER_MS;
    const p99ms = histogram.percentile(99) / NS_PER_MS;
    const maxMs = histogram.max / NS_PER_MS;
    histogram.reset();

    const eluNow = performance.eventLoopUtilization();
    const eluDelta = performance.eventLoopUtilization(eluNow, prevElu);
    prevElu = eluNow;

    const cpuNow = process.cpuUsage();
    const hrtimeNow = process.hrtime.bigint();
    const cpuDeltaUs =
      cpuNow.user - prevCpu.user + (cpuNow.system - prevCpu.system);
    const elapsedUs = Number(hrtimeNow - prevHrtime) / NS_PER_US;
    const cpuRatio = elapsedUs > 0 ? cpuDeltaUs / elapsedUs : 0;
    prevCpu = cpuNow;
    prevHrtime = hrtimeNow;

    result.observe(delayP50, p50ms);
    result.observe(delayP95, p95ms);
    result.observe(delayP99, p99ms);
    result.observe(delayMax, maxMs);
    result.observe(utilization, eluDelta.utilization);
    result.observe(cpuUtilization, cpuRatio);
  };

  const observables: Observable[] = [
    delayP50,
    delayP95,
    delayP99,
    delayMax,
    utilization,
    cpuUtilization,
  ];

  meter.addBatchObservableCallback(callback, observables);

  return {
    stop(): void {
      meter.removeBatchObservableCallback(callback, observables);
      histogram.disable();
    },
  };
}
