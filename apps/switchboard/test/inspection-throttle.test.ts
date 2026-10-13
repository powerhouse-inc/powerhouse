import { describe, expect, it } from "vitest";
import { inspectionThrottleFromEnv } from "../src/inspection-throttle.mjs";

describe("inspectionThrottleFromEnv", () => {
  it("keeps the default when unset or blank", () => {
    expect(inspectionThrottleFromEnv({})).toEqual({});
    expect(
      inspectionThrottleFromEnv({ PH_INSPECTION_CALLS_PER_MINUTE: " " }),
    ).toEqual({});
  });

  it("reads PH_INSPECTION_CALLS_PER_MINUTE", () => {
    expect(
      inspectionThrottleFromEnv({ PH_INSPECTION_CALLS_PER_MINUTE: " 30 " }),
    ).toEqual({ callsPerMinute: 30 });
  });

  it.each(["abc", "-1", "1.5", "0", "1O"])("throws on %s", (raw) => {
    expect(() =>
      inspectionThrottleFromEnv({ PH_INSPECTION_CALLS_PER_MINUTE: raw }),
    ).toThrow(/PH_INSPECTION_CALLS_PER_MINUTE/);
  });
});
