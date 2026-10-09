// Spans and metrics for runs, steps, workers and the reactor a step reaches.
// The host passes its tracer and meter; absent, the global API's (no-op until registered).
import {
  context as otelContext,
  metrics,
  SpanStatusCode,
  trace,
  type Attributes,
  type BatchObservableCallback,
  type Context,
  type Counter,
  type Histogram,
  type Meter,
  type ObservableGauge,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import type {
  WorkerPhaseTiming,
  WorkerTimings,
} from "./pieces/activepieces/worker/protocol.js";
import {
  resolutionOf,
  type BlockResolution,
} from "./pieces/engine/resolution.js";
import type { BlockExecutor } from "./pieces/engine/types.js";

export const TELEMETRY_SCOPE = "@powerhousedao/reactor-workflow";

export interface WorkflowTelemetryOptions {
  tracer?: Tracer;
  meter?: Meter;
}

export interface WorkerPoolStats {
  size: number;
  active: number;
  waiting: number;
}

export class WorkflowTelemetry {
  readonly tracer: Tracer;
  private readonly meter: Meter;
  private readonly runs: Counter;
  private readonly runDuration: Histogram;
  private readonly stepDuration: Histogram;
  private readonly phaseDuration: Histogram;
  private poolGauges?: Record<"size" | "active" | "waiting", ObservableGauge>;

  constructor(options: WorkflowTelemetryOptions = {}) {
    this.tracer = options.tracer ?? trace.getTracer(TELEMETRY_SCOPE);
    this.meter = options.meter ?? metrics.getMeter(TELEMETRY_SCOPE);
    this.runs = this.meter.createCounter("workflow.runs", {
      description: "Runs finished, by status and trigger kind",
      unit: "{run}",
    });
    this.runDuration = this.meter.createHistogram("workflow.run.duration", {
      description: "Run duration from fire to the journal closing it",
      unit: "ms",
    });
    this.stepDuration = this.meter.createHistogram("workflow.step.duration", {
      description: "Step duration, by piece and status",
      unit: "ms",
    });
    this.phaseDuration = this.meter.createHistogram("workflow.phase.duration", {
      description:
        "Duration of one part of a run: load, journal writes, worker, reactor calls",
      unit: "ms",
    });
  }

  // `name` is also the `phase` attribute on workflow.phase.duration.
  phase<T>(
    name: string,
    attributes: Attributes,
    fn: (span: Span) => Promise<T>,
    parent?: Context,
  ): Promise<T> {
    const started = performance.now();
    return this.span(`workflow.${name}`, attributes, fn, parent).finally(() =>
      this.recordPhase(name, performance.now() - started),
    );
  }

  // The child's own marks, as spans under its request. `forkedAt` starts the
  // boot span when this response is the child's first.
  workerTimings(
    request: Span,
    timings: WorkerTimings,
    forkedAt: number,
    ipc: { sent: number; received: number },
  ): void {
    const under = (span: Span) => trace.setSpan(otelContext.active(), span);
    const child = (
      name: string,
      start: number,
      end: number,
      parent: Span = request,
      attributes?: Attributes,
    ): Span => {
      const span = this.tracer.startSpan(
        `workflow.worker.${name}`,
        { startTime: start, ...(attributes ? { attributes } : {}) },
        under(parent),
      );
      span.end(end);
      this.recordPhase(`worker.${name}`, end - start);
      return span;
    };
    const ready = epoch(timings.ready);
    if (ready !== undefined && forkedAt > 0) {
      child("boot", forkedAt, Math.max(forkedAt, ready));
    }
    const received = epoch(timings.received);
    const sent = epoch(timings.sent);
    // A request queued behind boot only starts travelling once the child is up.
    const delivered = Math.max(ipc.sent, ready ?? 0);
    if (received !== undefined) {
      child("ipc.in", delivered, Math.max(delivered, received));
    }
    // Parents first, so a nested phase finds the span it ran inside.
    const byName = new Map<string, Span>();
    const phases = Array.isArray(timings.phases) ? timings.phases : [];
    for (const phase of phases
      .filter(knownPhase)
      .sort((a, b) => a.start - b.start)) {
      const parent = phase.parent ? byName.get(phase.parent) : undefined;
      byName.set(
        phase.name,
        child(
          phase.name,
          phase.start,
          phase.end,
          parent,
          phaseAttributes(phase.attributes),
        ),
      );
    }
    if (sent !== undefined) {
      child("ipc.out", sent, Math.max(sent, ipc.received));
    }
  }

  recordPhase(name: string, ms: number): void {
    this.phaseDuration.record(ms, { phase: name });
  }

  span<T>(
    name: string,
    attributes: Attributes,
    fn: (span: Span) => Promise<T>,
    parent: Context = otelContext.active(),
  ): Promise<T> {
    return this.tracer.startActiveSpan(
      name,
      { attributes },
      parent,
      async (span) => {
        try {
          return await fn(span);
        } catch (error) {
          failSpan(span, error);
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  recordRun(ms: number, status: string, triggerKind: string): void {
    const attributes = {
      "run.status": status,
      "trigger.kind": metricTriggerKind(triggerKind),
    };
    this.runs.add(1, attributes);
    this.runDuration.record(ms, attributes);
  }

  recordStep(ms: number, pieceName: string, status: string): void {
    this.stepDuration.record(ms, {
      "piece.name": pieceName,
      "step.status": status,
    });
  }

  // Gauges read on each collection. Returns the unobserve a disposed pool calls,
  // so a replaced runtime's pool stops reporting and can be collected.
  observeWorkerPool(stats: () => WorkerPoolStats): () => void {
    this.poolGauges ??= this.createPoolGauges();
    const { size, active, waiting } = this.poolGauges;
    const observables = [size, active, waiting];
    const callback: BatchObservableCallback = (result) => {
      const current = stats();
      result.observe(size, current.size);
      result.observe(active, current.active);
      result.observe(waiting, current.waiting);
    };
    this.meter.addBatchObservableCallback(callback, observables);
    return () =>
      this.meter.removeBatchObservableCallback(callback, observables);
  }

  private createPoolGauges() {
    const gauge = (name: string, description: string) =>
      this.meter.createObservableGauge(name, { description, unit: "{worker}" });
    return {
      size: gauge("workflow.worker.pool.size", "Worker slots"),
      active: gauge("workflow.worker.pool.active", "Slots held by runs"),
      waiting: gauge("workflow.worker.pool.waiting", "Runs waiting for a slot"),
    };
  }
}

// The child is piece code: only the phases it is built to report, well-formed,
// become spans and metric labels.
const WORKER_PHASES = new Set([
  "piece.load",
  "reactor.open",
  "models",
  "action",
]);
const WORKER_ATTRIBUTES: Record<string, "boolean" | "string"> = {
  "piece.cached": "boolean",
  "document.type": "string",
};
const MAX_ATTRIBUTE_LENGTH = 256;

function epoch(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function knownPhase(phase: unknown): phase is WorkerPhaseTiming {
  if (typeof phase !== "object" || phase === null) return false;
  const { name, start, end, parent } = phase as Partial<WorkerPhaseTiming>;
  return (
    typeof name === "string" &&
    WORKER_PHASES.has(name) &&
    (parent === undefined || WORKER_PHASES.has(parent)) &&
    epoch(start) !== undefined &&
    epoch(end) !== undefined &&
    end! >= start!
  );
}

function phaseAttributes(attributes: unknown): Attributes | undefined {
  if (typeof attributes !== "object" || attributes === null) return undefined;
  const kept: Attributes = {};
  for (const [key, type] of Object.entries(WORKER_ATTRIBUTES)) {
    const value = (attributes as Record<string, unknown>)[key];
    if (typeof value !== type) continue;
    kept[key] =
      typeof value === "string"
        ? value.slice(0, MAX_ATTRIBUTE_LENGTH)
        : (value as boolean);
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

// Piece trigger kinds embed author-typed names; metrics keep only "piece".
function metricTriggerKind(triggerKind: string): string {
  return triggerKind.startsWith("piece:") ? "piece" : triggerKind;
}

// A step's piece as a metric attribute: the name only once it resolved to a
// real piece, since a workflow author can type any string into the document.
function metricPieceName(
  step: { pieceName: string },
  resolution: BlockResolution | undefined,
): string {
  return resolution?.resolved && resolution.match !== "missing"
    ? step.pieceName
    : "unresolved";
}

// One `workflow.step` span per executed block, and its duration by piece.
export function tracedSteps(
  executor: BlockExecutor,
  telemetry: WorkflowTelemetry,
): BlockExecutor {
  return {
    execute(execution) {
      const { step } = execution;
      const started = performance.now();
      let status = "FAILED";
      let resolution: BlockResolution | undefined;
      return telemetry
        .span(
          "workflow.step",
          {
            "step.id": step.id,
            "step.key": step.key,
            "piece.name": step.pieceName,
            "action.name": step.actionName,
          },
          async (span) => {
            try {
              const result = await executor.execute(execution);
              resolution = result.resolution;
              status = "SUCCEEDED";
              const version = resolution?.resolved?.version;
              if (version) span.setAttribute("piece.version", version);
              return result;
            } catch (error) {
              resolution = resolutionOf(error);
              throw error;
            }
          },
        )
        .finally(() => {
          telemetry.recordStep(
            performance.now() - started,
            metricPieceName(step, resolution),
            status,
          );
        });
    },
  };
}

export function failSpan(span: Span, error: unknown): void {
  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });
}

// Every promise-returning method of `target` runs in a span parented on `parent`.
export function tracedMethods<T extends object>(
  target: T,
  telemetry: WorkflowTelemetry,
  prefix: string,
  parent: Context,
): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value = Reflect.get(object, property, receiver) as unknown;
      if (typeof value !== "function" || typeof property !== "string") {
        return value;
      }
      const phase = `${prefix}.${property}`;
      return (...args: unknown[]) =>
        telemetry.tracer.startActiveSpan(
          `workflow.${phase}`,
          {},
          parent,
          (span) => {
            const started = performance.now();
            const end = (error?: unknown) => {
              if (error !== undefined) failSpan(span, error);
              span.end();
              telemetry.recordPhase(phase, performance.now() - started);
            };
            let result: unknown;
            try {
              result = (value as (...a: unknown[]) => unknown).apply(
                object,
                args,
              );
            } catch (error) {
              end(error);
              throw error;
            }
            // A synchronous method answers synchronously.
            if (!(result instanceof Promise)) {
              end();
              return result;
            }
            return result.then(
              (resolved: unknown) => {
                end();
                return resolved;
              },
              (error: unknown) => {
                end(error);
                throw error;
              },
            );
          },
        );
    },
  });
}
