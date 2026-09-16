// The author's poll cadence for a piece trigger: pollEverySeconds in the
// trigger config, lifted out before the config reaches the piece.
import { describe, expect, it } from "vitest";
import { splitPollInterval } from "./service.js";
import {
  pollIntervalFor,
  type PieceTriggerBinding,
} from "./trigger-supervisor.js";

const binding = (pollIntervalMs?: number): PieceTriggerBinding => ({
  workflowId: "wf",
  blockType: "@acme/piece-x@1.0.0#trigger:new_thing",
  packageName: "@acme/piece-x",
  version: "1.0.0",
  triggerName: "new_thing",
  config: {},
  pollIntervalMs,
});

describe("splitPollInterval", () => {
  it("lifts the key out of the config and converts to ms", () => {
    expect(splitPollInterval({ channel: "c1", pollEverySeconds: 90 })).toEqual({
      config: { channel: "c1" },
      pollIntervalMs: 90_000,
    });
  });

  it("accepts a numeric string, as a form field yields", () => {
    expect(splitPollInterval({ pollEverySeconds: "120" })).toEqual({
      config: {},
      pollIntervalMs: 120_000,
    });
  });

  it("leaves a config without the key untouched", () => {
    const config = { channel: "c1" };
    expect(splitPollInterval(config)).toEqual({ config });
  });

  it("drops an unusable value but still strips the key", () => {
    // The piece must never see it, valid or not.
    for (const raw of ["", "soon", 0, -5, null, {}]) {
      expect(
        splitPollInterval({ channel: "c1", pollEverySeconds: raw }),
      ).toEqual({ config: { channel: "c1" } });
    }
  });
});

describe("pollIntervalFor", () => {
  // Two minutes, so it is distinguishable from the 300s default below.
  const schedules = [{ cronExpression: "*/2 * * * *" }];

  it("prefers the author's override over the piece's own schedule", () => {
    expect(pollIntervalFor(binding(90_000), schedules, 300_000)).toBe(90_000);
  });

  it("falls back to the piece's schedule when there is no override", () => {
    expect(pollIntervalFor(binding(), schedules, 300_000)).toBe(120_000);
  });

  it("falls back to the runtime default when the piece asks for nothing", () => {
    expect(pollIntervalFor(binding(), undefined, 300_000)).toBe(300_000);
  });

  it("holds the 60s floor against a smaller override", () => {
    expect(pollIntervalFor(binding(5_000), undefined, 300_000)).toBe(60_000);
  });

  it("arms the interval branch of setSchedule as the cadence itself", () => {
    expect(pollIntervalFor(binding(), [{ intervalMs: 180_000 }], 300_000)).toBe(
      180_000,
    );
  });
});
