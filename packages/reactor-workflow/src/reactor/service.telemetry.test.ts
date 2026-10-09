// A run's spans and metrics, through a real tracer and meter: a forked piece
// step under a run span, journal phases beside it.
import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";
import { WorkflowTelemetry } from "../telemetry.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";

const PIECE = "@acme/piece-echo";
// A name a workflow author typed that no source has.
const UNKNOWN_PIECE = "@acme/never-published";

function workflowDocument(status = "ENABLED", pieceName = PIECE) {
  return {
    header: { documentType: "powerhouse/workflow" },
    state: {
      global: {
        name: "Traced",
        status,
        version: 1,
        trigger: {
          id: "t1",
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: CORE_PIECE_VERSION,
          triggerName: "manual",
          config: {},
        },
        steps: [
          {
            id: "s0",
            key: "echo",
            pieceName,
            pieceVersion: "1.0.0",
            actionName: "echo",
            config: {},
          },
        ],
        edges: [{ id: "e0", from: "t1", to: "s0", port: "next" }],
        variables: [],
      },
    },
  };
}

const documents: Record<string, ReturnType<typeof workflowDocument>> = {
  "wf-traced": workflowDocument(),
  "wf-disabled": workflowDocument("DISABLED"),
  "wf-unresolved": workflowDocument("ENABLED", UNKNOWN_PIECE),
};

const contextManager = new AsyncLocalStorageContextManager();
const spans = new InMemorySpanExporter();
const tracerProvider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(spans)],
});
const metricExporter = new InMemoryMetricExporter(
  AggregationTemporality.CUMULATIVE,
);
const reader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60_000,
});
const meterProvider = new MeterProvider({ readers: [reader] });

let dir = "";
let service: WorkflowRuntimeService;

beforeAll(async () => {
  context.setGlobalContextManager(contextManager.enable());
  dir = await mkdtemp(join(tmpdir(), "ph-telemetry-"));
  const entryPath = join(dir, "index.mjs");
  await writeFile(
    entryPath,
    `export const echo = { displayName: "Echo", actions: { echo: { name: "echo",
      displayName: "Echo", props: {}, run: async () => ({ ok: true }) } }, triggers: {} };`,
  );
  packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  service = testRuntime({
    reactorClient: {
      get: (id: string) =>
        id === "wf-unreachable"
          ? Promise.reject(new Error("reactor down"))
          : Promise.resolve(documents[id]),
    } as never,
    telemetry: {
      tracer: tracerProvider.getTracer("test"),
      meter: meterProvider.getMeter("test"),
    },
  });
});

afterAll(async () => {
  service.shutdown();
  packagePieces.reset();
  context.disable();
  await meterProvider.shutdown();
  await tracerProvider.shutdown();
  await rm(dir, { recursive: true, force: true });
});

const named = (name: string) =>
  spans.getFinishedSpans().filter((span) => span.name === name);
const only = (name: string): ReadableSpan => {
  const found = named(name);
  expect(found, name).toHaveLength(1);
  return found[0]!;
};
const parentOf = (span: ReadableSpan) => span.parentSpanContext?.spanId;

describe("a fired run's telemetry", () => {
  it("nests the step and its worker request under the run", async () => {
    spans.reset();
    const result = await service.fire("wf-traced", undefined, "schedule");
    expect(result.status).toBe("SUCCEEDED");

    const run = only("workflow.run");
    expect(run.attributes).toMatchObject({
      "workflow.id": "wf-traced",
      "trigger.kind": "schedule",
      "run.status": "SUCCEEDED",
      "run.id": result.runId,
    });
    const step = only("workflow.step");
    expect(parentOf(step)).toBe(run.spanContext().spanId);
    expect(step.attributes).toMatchObject({
      "step.key": "echo",
      "piece.name": PIECE,
      "action.name": "echo",
    });
    // Each run forks its own child, so its first request is cold.
    const request = only("workflow.worker.run.cold");
    expect(parentOf(request)).toBe(step.spanContext().spanId);
    // The child's own marks, drawn under the request that carried them back.
    // The first run also describes its piece, so the design worker boots too.
    const underRequest = (name: string) => {
      const found = named(name).filter(
        (span) => parentOf(span) === request.spanContext().spanId,
      );
      expect(found, name).toHaveLength(1);
      return found[0]!;
    };
    for (const phase of [
      "workflow.worker.boot",
      "workflow.worker.piece.load",
      "workflow.worker.action",
    ]) {
      const span = underRequest(phase);
      expect(span.startTime, phase).not.toEqual(span.endTime);
    }
    expect(underRequest("workflow.worker.piece.load").attributes).toMatchObject(
      { "piece.cached": false },
    );
    // The request's way in and the reply's way out, beside the child's work.
    underRequest("workflow.worker.ipc.in");
    underRequest("workflow.worker.ipc.out");
    for (const phase of [
      "workflow.load",
      "workflow.journal.start",
      "workflow.journal.finish",
    ]) {
      expect(parentOf(only(phase)), phase).toBe(run.spanContext().spanId);
    }
    expect(parentOf(only("workflow.journal.step"))).toBe(
      run.spanContext().spanId,
    );
    // No reactor connection is bound, so no run user is looked up.
    expect(named("workflow.run_user")).toHaveLength(0);
  });

  it("counts runs and times steps and phases", async () => {
    await reader.forceFlush();
    const metrics = metricExporter
      .getMetrics()
      .at(-1)!
      .scopeMetrics.flatMap((scope) => scope.metrics);
    const metric = (name: string) =>
      metrics.find((m) => m.descriptor.name === name);

    expect(metric("workflow.runs")?.dataPoints).toContainEqual(
      expect.objectContaining({
        attributes: { "run.status": "SUCCEEDED", "trigger.kind": "schedule" },
        value: 1,
      }),
    );
    expect(metric("workflow.step.duration")?.dataPoints).toContainEqual(
      expect.objectContaining({
        attributes: { "piece.name": PIECE, "step.status": "SUCCEEDED" },
      }),
    );
    const phases = metric("workflow.phase.duration")!.dataPoints.map(
      (point) => point.attributes.phase,
    );
    expect(phases).toEqual(
      expect.arrayContaining([
        "load",
        "journal.start",
        "journal.step",
        "journal.finish",
        "worker.acquire",
        "worker.run.cold",
        "worker.boot",
        "worker.action",
      ]),
    );
    expect(
      metric("workflow.worker.pool.size")?.dataPoints[0]?.value,
    ).toBeGreaterThan(0);
  });

  it("counts a fire refused before its run began as REFUSED", async () => {
    spans.reset();
    await expect(
      service.fire("wf-disabled", undefined, "schedule"),
    ).rejects.toThrow(/DISABLED/);

    expect(only("workflow.run").attributes["run.status"]).toBe("REFUSED");
    const runs = await dataPoints(reader, "workflow.runs");
    expect(runs).toContainEqual(
      expect.objectContaining({
        attributes: { "run.status": "REFUSED", "trigger.kind": "schedule" },
        value: 1,
      }),
    );
    expect(runs.map((point) => point.attributes["run.status"])).not.toContain(
      "FAILED",
    );
  });

  it("counts a fire that could not load its workflow as FAILED", async () => {
    spans.reset();
    await expect(
      service.fire("wf-unreachable", undefined, "webhook"),
    ).rejects.toThrow(/reactor down/);

    expect(only("workflow.run").attributes["run.status"]).toBe("FAILED");
    expect(await dataPoints(reader, "workflow.runs")).toContainEqual(
      expect.objectContaining({
        attributes: { "run.status": "FAILED", "trigger.kind": "webhook" },
      }),
    );
  });

  it("keeps a piece name nothing resolved out of the step metric", async () => {
    const result = await service.fire("wf-unresolved", undefined, "schedule");
    expect(result.status).toBe("FAILED");

    // The span still says what the author wrote.
    expect(named("workflow.step").at(-1)?.attributes["piece.name"]).toBe(
      UNKNOWN_PIECE,
    );
    const names = (await dataPoints(reader, "workflow.step.duration")).map(
      (point) => point.attributes["piece.name"],
    );
    expect(names).toContain("unresolved");
    expect(names).not.toContain(UNKNOWN_PIECE);
  });
});

describe("worker timings", () => {
  it("nests a phase under the phase it ran inside", () => {
    spans.reset();
    const tracer = tracerProvider.getTracer("test");
    const telemetry = new WorkflowTelemetry({
      tracer,
      meter: meterProvider.getMeter("test"),
    });
    const at = Date.now();
    const request = tracer.startSpan("request");
    telemetry.workerTimings(
      request,
      {
        received: at + 2,
        sent: at + 9,
        // Ended first, so the child lists it first.
        phases: [
          { name: "models", start: at + 4, end: at + 6, parent: "action" },
          { name: "action", start: at + 3, end: at + 8 },
        ],
      },
      0,
      { sent: at + 1, received: at + 10 },
    );
    request.end();

    const action = only("workflow.worker.action");
    expect(parentOf(action)).toBe(request.spanContext().spanId);
    expect(parentOf(only("workflow.worker.models"))).toBe(
      action.spanContext().spanId,
    );
  });
});

describe("worker timings from piece code", () => {
  const telemetry = () =>
    new WorkflowTelemetry({
      tracer: tracerProvider.getTracer("test"),
      meter: meterProvider.getMeter("test"),
    });

  it("draws only the phases a worker reports, with their own attributes", async () => {
    spans.reset();
    const at = Date.now();
    const request = tracerProvider.getTracer("test").startSpan("request");
    telemetry().workerTimings(
      request,
      {
        received: at + 1,
        sent: at + 5,
        phases: [
          { name: "forged-1", start: at + 2, end: at + 3 },
          { name: "action", start: at + 2, end: at + 4, parent: "forged-2" },
          { name: "models", start: at + 4, end: at + 2 },
          {
            name: "piece.load",
            start: at + 1,
            end: at + 2,
            attributes: { "piece.cached": true, secret: "x" },
          },
        ],
      },
      0,
      { sent: at, received: at + 6 },
    );
    request.end();

    const names = spans.getFinishedSpans().map((span) => span.name);
    expect(names).not.toContain("workflow.worker.forged-1");
    expect(names).not.toContain("workflow.worker.action");
    expect(names).not.toContain("workflow.worker.models");
    expect(only("workflow.worker.piece.load").attributes).toEqual({
      "piece.cached": true,
    });
    const phases = (await dataPoints(reader, "workflow.phase.duration")).map(
      (point) => point.attributes.phase,
    );
    expect(phases).not.toContain("worker.forged-1");
  });

  it("ignores timings of the wrong shape", () => {
    const request = tracerProvider.getTracer("test").startSpan("request");
    expect(() =>
      telemetry().workerTimings(
        request,
        { received: "now", sent: null, phases: 1 } as never,
        0,
        { sent: 0, received: 0 },
      ),
    ).not.toThrow();
    request.end();
  });

  it("labels piece triggers on metrics by kind alone", async () => {
    telemetry().recordRun(1, "SUCCEEDED", "piece:@acme/anything:poll");
    const kinds = (await dataPoints(reader, "workflow.runs")).map(
      (point) => point.attributes["trigger.kind"],
    );
    expect(kinds).toContain("piece");
    expect(kinds).not.toContain("piece:@acme/anything:poll");
  });
});

describe("a runtime shut down", () => {
  it("stops reporting its worker pool", async () => {
    // Delta: a cumulative reader keeps repeating a gauge's last value even
    // once nothing observes it, which would hide whether the callback went.
    const ownReader = new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.DELTA),
      exportIntervalMillis: 60_000,
    });
    const ownMeters = new MeterProvider({ readers: [ownReader] });
    const runtime = testRuntime({
      reactorClient: {
        get: (id: string) => Promise.resolve(documents[id]),
      } as never,
      telemetry: {
        tracer: tracerProvider.getTracer("test"),
        meter: ownMeters.getMeter("test"),
      },
    });
    await runtime.fire("wf-traced", undefined, "schedule");
    expect(
      await dataPoints(ownReader, "workflow.worker.pool.size"),
    ).not.toEqual([]);

    runtime.shutdown();

    expect(await dataPoints(ownReader, "workflow.worker.pool.size")).toEqual(
      [],
    );
    await ownMeters.shutdown();
  });
});

async function dataPoints(
  from: PeriodicExportingMetricReader,
  name: string,
): Promise<{ attributes: Record<string, unknown>; value: unknown }[]> {
  const { resourceMetrics } = await from.collect();
  const metric = resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .find((m) => m.descriptor.name === name);
  return (metric?.dataPoints ?? []) as never;
}
