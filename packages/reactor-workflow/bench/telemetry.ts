// The bench's tracer and meter: span durations aggregated by name in memory,
// and optionally every span exported over OTLP (e.g. to a local Tempo).
import { context, type Context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";

// Keeps durations, not spans, so a long run stays small.
class DurationsByName implements SpanProcessor {
  readonly durations = new Map<string, number[]>();
  recording = false;

  onStart(_span: Span, _parent: Context): void {}

  onEnd(span: ReadableSpan): void {
    if (!this.recording) return;
    const [seconds, nanos] = span.duration;
    const ms = seconds * 1000 + nanos / 1e6;
    const list = this.durations.get(span.name) ?? [];
    list.push(ms);
    this.durations.set(span.name, list);
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export interface SpanRow {
  name: string;
  count: number;
  perRun: number;
  mean: number;
  p50: number;
  p95: number;
}

export function benchTelemetry(options: {
  otlp?: string;
  attributes: Record<string, string>;
}) {
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable(),
  );
  const durations = new DurationsByName();
  const resource = resourceFromAttributes({
    "service.name": "reactor-workflow-bench",
    ...options.attributes,
  });
  const tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [
      durations,
      ...(options.otlp
        ? [
            new BatchSpanProcessor(
              new OTLPTraceExporter({ url: `${options.otlp}/v1/traces` }),
              { maxQueueSize: 100_000, maxExportBatchSize: 2_000 },
            ),
          ]
        : []),
    ],
  });
  // Instruments record as they would in a host; nothing reads them here.
  const meterProvider = new MeterProvider({ resource });

  return {
    tracer: tracerProvider.getTracer("@powerhousedao/reactor-workflow"),
    meter: meterProvider.getMeter("@powerhousedao/reactor-workflow"),
    record(on: boolean) {
      durations.recording = on;
    },
    breakdown(runs: number): SpanRow[] {
      return [...durations.durations]
        .map(([name, list]) => {
          const sorted = [...list].sort((a, b) => a - b);
          const total = sorted.reduce((a, b) => a + b, 0);
          const at = (p: number) =>
            sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
          return {
            name,
            count: sorted.length,
            perRun: total / runs,
            mean: total / sorted.length,
            p50: at(0.5),
            p95: at(0.95),
          };
        })
        .sort((a, b) => b.perRun - a.perRun);
    },
    async shutdown() {
      await tracerProvider.shutdown();
      await meterProvider.shutdown();
    },
  };
}
