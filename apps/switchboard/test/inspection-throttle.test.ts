import { describe, expect, it, vi } from "vitest";
import { inspectionThrottleFromEnv } from "../src/inspection-throttle.mjs";

describe("inspectionThrottleFromEnv", () => {
  it("keeps every default when nothing is set", () => {
    const warn = vi.fn();
    expect(inspectionThrottleFromEnv({}, { warn })).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads each variable", () => {
    expect(
      inspectionThrottleFromEnv(
        { PH_INSPECTION_CALLS_PER_MINUTE: " 30 " },
        { warn: vi.fn() },
      ),
    ).toEqual({ callsPerMinute: 30 });
  });

  it.each(["abc", "-1", "1.5", "0"])(
    "warns about and drops %s for a field that must be positive",
    (raw) => {
      const warn = vi.fn();
      expect(
        inspectionThrottleFromEnv(
          { PH_INSPECTION_CALLS_PER_MINUTE: raw },
          { warn },
        ),
      ).toEqual({});
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("PH_INSPECTION_CALLS_PER_MINUTE"),
      );
    },
  );
});
