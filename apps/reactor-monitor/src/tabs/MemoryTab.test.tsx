// @vitest-environment happy-dom
import type {
  MemorySample,
  MemoryTelemetryReport,
} from "@powerhousedao/reactor";
import type {
  MemoryLevers,
  MonitorInspector,
} from "@powerhousedao/reactor-monitor";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatMb, MemoryTab, pgliteSeries } from "./MemoryTab.js";

const MB = 1024 * 1024;

function sample(minute: number, rssMb: number): MemorySample {
  return {
    t: new Date(Date.UTC(2026, 9, 30, 12, minute)).toISOString(),
    rss: rssMb * MB,
    heapUsed: (rssMb / 2) * MB,
    postGcHeap: minute === 0 ? null : (rssMb / 3) * MB,
    workers: {
      "pglite:read": { heapUsed: MB, wasm: 300 * MB },
      "executor#1": { heapUsed: MB },
    },
    counters: { opsWritten: minute * 1000 },
  } as unknown as MemorySample;
}

function report(
  overrides: Partial<MemoryTelemetryReport> = {},
): MemoryTelemetryReport {
  return {
    enabled: true,
    intervalMs: 30_000,
    consoleIntervalMs: 300_000,
    outputs: ["memory", "file"],
    file: "D:/x/.ph/telemetry/memory.jsonl",
    startedAt: "2026-10-30T12:00:00.000Z",
    summary: {
      windowMin: 30,
      mbPer1kOps: 17.2,
      postGcMbPer1kOps: 14,
      rssMbPerMin: 61.4,
      heapMbPerMin: 50,
      postGcMbPerMin: 48.9,
      externalMbPerMin: 0,
      pgliteMbPerMin: 2,
      verdict: "growing",
      topGauges: [],
      gauges: [
        { gauge: "jobTracker.size", value: 40_228, perMin: 120.5, r: 0.91 },
        { gauge: "queue.pending", value: 2, perMin: 0, r: null },
      ],
    },
    samples: [sample(0, 100), sample(1, 200)],
    ...overrides,
  };
}

function inspectorOf(read: () => Promise<MemoryTelemetryReport>) {
  return { getMemoryTelemetry: read } as unknown as MonitorInspector;
}

function leversStub(): MemoryLevers & {
  setMemoryTelemetry: ReturnType<typeof vi.fn>;
  writeHeapSnapshot: ReturnType<typeof vi.fn>;
} {
  return {
    setMemoryTelemetry: vi.fn(() => Promise.resolve()),
    writeHeapSnapshot: vi.fn(() => Promise.resolve("D:/x/heap.heapsnapshot")),
  };
}

describe("MemoryTab", () => {
  it("draws the charts, on one axis each, and the gauge table", async () => {
    const view = render(
      <MemoryTab inspector={inspectorOf(() => Promise.resolve(report()))} />,
    );
    const charts = await view.findByTestId("memory-charts");
    const names = [...charts.querySelectorAll("figcaption")].map(
      (caption) => caption.textContent,
    );
    expect(names).toEqual([
      "Main process memory",
      "Operations written",
      "PGlite WASM per store",
    ]);
    expect(charts.querySelectorAll("path").length).toBe(5);
    expect(view.getByTestId("memory-rates").textContent).toContain("growing");
    expect(view.getByTestId("memory-gauges").textContent).toContain(
      "jobTracker.size",
    );
    expect(view.getByTestId("memory-file").textContent).toContain(
      "memory.jsonl",
    );
  });

  it("says when the host has no telemetry", async () => {
    const view = render(
      <MemoryTab
        inspector={inspectorOf(() => Promise.reject(new Error("unsupported")))}
      />,
    );
    expect(await view.findByTestId("memory-unavailable")).toBeTruthy();
  });

  it("offers to start it when off", async () => {
    const levers = leversStub();
    const view = render(
      <MemoryTab
        inspector={inspectorOf(() =>
          Promise.resolve(
            report({ enabled: false, samples: [], summary: null, file: null }),
          ),
        )}
        levers={levers}
      />,
    );
    expect(await view.findByTestId("memory-off")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Start telemetry" }));
    await waitFor(() =>
      expect(levers.setMemoryTelemetry).toHaveBeenCalledWith({ enabled: true }),
    );
  });

  it("shows where a heap snapshot went, and a refusal", async () => {
    const levers = leversStub();
    const view = render(
      <MemoryTab
        inspector={inspectorOf(() => Promise.resolve(report()))}
        levers={levers}
      />,
    );
    await view.findByTestId("memory-charts");
    fireEvent.click(view.getByRole("button", { name: "Heap snapshot" }));
    expect((await view.findByTestId("memory-snapshot")).textContent).toContain(
      "heap.heapsnapshot",
    );

    levers.writeHeapSnapshot.mockRejectedValueOnce(new Error("Too little"));
    fireEvent.click(view.getByRole("button", { name: "Heap snapshot" }));
    expect((await view.findByRole("alert")).textContent).toContain(
      "Too little",
    );
  });

  it("closes the levers without any", async () => {
    const view = render(
      <MemoryTab inspector={inspectorOf(() => Promise.resolve(report()))} />,
    );
    await view.findByTestId("memory-charts");
    expect(
      (view.getByRole("button", { name: "Heap snapshot" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("pgliteSeries", () => {
  function withStores(names: string[]): MemorySample {
    return {
      workers: Object.fromEntries(
        names.map((name) => [name, { heapUsed: 0, wasm: 100 * MB }]),
      ),
    } as unknown as MemorySample;
  }

  it("takes only stores, and folds past three into other stores", () => {
    const series = pgliteSeries([
      withStores(["pglite:a", "pglite:b", "pglite:c", "pglite:d"]),
    ]);
    expect(series.map((s) => s.name)).toEqual([
      "pglite:a",
      "pglite:b",
      "other stores",
    ]);
    expect(series[2]!.values).toEqual([200]);
  });

  it("keeps three stores as they are", () => {
    const series = pgliteSeries([withStores(["a", "b", "c"])]);
    expect(series.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });
});

describe("formatMb", () => {
  it("switches to GB past 1024", () => {
    expect(formatMb(512)).toBe("512 MB");
    expect(formatMb(2048)).toBe("2.00 GB");
  });
});
