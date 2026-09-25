import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDuration,
  formatMs,
  formatWhen,
  runStats,
  workflowHealth,
} from "./run-format.js";

describe("formatMs", () => {
  it.each([
    [0, "0ms"],
    [87, "87ms"],
    [999, "999ms"],
    [1000, "1.0s"],
    [1500, "1.5s"],
    [59_940, "59.9s"],
    [59_960, "1m 0s"],
    [60_000, "1m 0s"],
    [119_400, "1m 59s"],
    [119_700, "2m 0s"],
    [125_000, "2m 5s"],
  ])("%d → %s", (ms, text) => {
    expect(formatMs(ms)).toBe(text);
  });
});

describe("formatDuration", () => {
  it("measures between the two timestamps", () => {
    expect(
      formatDuration("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.200Z"),
    ).toBe("1.2s");
    expect(
      formatDuration("2026-01-01T00:00:00.000Z", "2026-01-01T00:02:03.000Z"),
    ).toBe("2m 3s");
  });

  it("shows an ellipsis while the run is still going", () => {
    expect(formatDuration("2026-01-01T00:00:00.000Z", null)).toBe("…");
  });
});

describe("formatWhen", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [0, "just now"],
    [59_999, "just now"],
    [60_000, "1m ago"],
    [3_599_999, "59m ago"],
    [3_600_000, "1h ago"],
    [86_399_999, "23h ago"],
  ])("%d ms ago → %s", (ms, text) => {
    expect(formatWhen(ago(ms))).toBe(text);
  });

  it("falls back to the date after a day", () => {
    const iso = ago(86_400_000);
    expect(formatWhen(iso)).toBe(new Date(iso).toLocaleDateString());
  });
});

describe("workflowHealth", () => {
  it("is idle for anything but an enabled workflow", () => {
    expect(workflowHealth(undefined, "FAILED")).toEqual({
      tone: "idle",
      label: "Draft",
    });
    expect(workflowHealth("DISABLED", "SUCCEEDED")).toEqual({
      tone: "idle",
      label: "Disabled",
    });
  });

  it("is idle for an enabled workflow that never ran", () => {
    expect(workflowHealth("ENABLED", undefined)).toEqual({
      tone: "idle",
      label: "Enabled, not run yet",
    });
  });

  it("takes its tone from the last run", () => {
    expect(workflowHealth("ENABLED", "SUCCEEDED")).toEqual({
      tone: "ok",
      label: "Enabled, last run succeeded",
    });
    expect(workflowHealth("ENABLED", "FAILED")).toEqual({
      tone: "fail",
      label: "Enabled, last run failed",
    });
    expect(workflowHealth("ENABLED", "MYSTERY")).toEqual({
      tone: "idle",
      label: "Enabled, last run mystery",
    });
  });
});

describe("runStats", () => {
  const run = (id: string, status: string): RunRecord => ({
    id,
    workflowId: "wf",
    workflowName: "Workflow",
    workflowVersion: 1,
    triggerKind: "manual",
    triggerPayload: null,
    status,
    error: null,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    rerunOf: null,
    steps: [],
  });

  it("has no success rate until a run finishes", () => {
    expect(runStats([])).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
      running: 0,
      lastRun: undefined,
      successRate: null,
    });
    expect(runStats([run("r1", "RUNNING")]).successRate).toBeNull();
  });

  it("counts statuses and rates only finished runs", () => {
    const runs = [
      run("r4", "RUNNING"),
      run("r3", "SUCCEEDED"),
      run("r2", "FAILED"),
      run("r1", "SUCCEEDED"),
    ];
    expect(runStats(runs)).toEqual({
      total: 4,
      succeeded: 2,
      failed: 1,
      running: 1,
      lastRun: runs[0],
      successRate: 67,
    });
  });
});
