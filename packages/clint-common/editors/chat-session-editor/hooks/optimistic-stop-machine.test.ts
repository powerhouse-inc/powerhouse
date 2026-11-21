import { describe, expect, it } from "vitest";
import {
  initialOptimisticStopState,
  optimisticStopReducer,
  selectStopStatus,
  type OptimisticStopEvent,
} from "./optimistic-stop-machine.js";

function run(events: OptimisticStopEvent[]) {
  return events.reduce(optimisticStopReducer, initialOptimisticStopState);
}

describe("optimisticStopReducer", () => {
  it("starts idle", () => {
    expect(selectStopStatus(initialOptimisticStopState, false)).toBe("idle");
  });

  it("submit arms the optimistic stop (submitted) before the server responds", () => {
    const s = run([{ type: "submit" }]);
    expect(selectStopStatus(s, false)).toBe("submitted");
  });

  it("server responding takes over the optimistic state (streaming)", () => {
    const s = run([{ type: "submit" }, { type: "confirmed" }]);
    expect(s.optimistic).toBe(false);
    expect(selectStopStatus(s, true)).toBe("streaming");
  });

  it("timeout reverts to send when no working signal arrived (no click)", () => {
    const s = run([{ type: "submit" }, { type: "timeout" }]);
    expect(selectStopStatus(s, false)).toBe("idle");
  });

  it("responding overrides the optimistic flag before confirmed", () => {
    const s = run([{ type: "submit" }]);
    expect(selectStopStatus(s, true)).toBe("streaming");
  });

  it("confirmed/timeout are no-ops when not optimistic (stable identity)", () => {
    expect(
      optimisticStopReducer(initialOptimisticStopState, { type: "confirmed" }),
    ).toBe(initialOptimisticStopState);
    expect(
      optimisticStopReducer(initialOptimisticStopState, { type: "timeout" }),
    ).toBe(initialOptimisticStopState);
    expect(
      optimisticStopReducer(initialOptimisticStopState, { type: "resolve" }),
    ).toBe(initialOptimisticStopState);
  });

  it("a second submit re-arms after a completed turn", () => {
    const s = run([
      { type: "submit" },
      { type: "confirmed" },
      { type: "submit" },
    ]);
    expect(selectStopStatus(s, false)).toBe("submitted");
  });

  describe("no-flip normal path", () => {
    it("selector reports submitted then streaming, with no idle in between when responding flips true", () => {
      // submitted (responding=false) → responding=true is streaming, never idle.
      const s = run([{ type: "submit" }]);
      expect(selectStopStatus(s, false)).toBe("submitted");
      expect(selectStopStatus(s, true)).toBe("streaming");
      const confirmed = run([{ type: "submit" }, { type: "confirmed" }]);
      expect(selectStopStatus(confirmed, true)).toBe("streaming");
    });

    it("normal completion responding=false → idle (no click)", () => {
      const s = run([{ type: "submit" }, { type: "confirmed" }]);
      expect(selectStopStatus(s, false)).toBe("idle");
    });
  });

  describe("sticky interrupting", () => {
    it("interrupt during the optimistic window enters interrupting", () => {
      const s = run([{ type: "submit" }, { type: "interrupt" }]);
      expect(s.interrupting).toBe(true);
      expect(selectStopStatus(s, false)).toBe("interrupting");
    });

    it("a late responding=true is absorbed — stays interrupting, does NOT flip to streaming", () => {
      const s = run([{ type: "submit" }, { type: "interrupt" }]);
      // server confirms a beat after the click
      expect(selectStopStatus(s, true)).toBe("interrupting");
      // an explicit confirmed event in this window is also absorbed
      const s2 = run([
        { type: "submit" },
        { type: "interrupt" },
        { type: "confirmed" },
      ]);
      expect(s2.interrupting).toBe(true);
      expect(selectStopStatus(s2, true)).toBe("interrupting");
    });

    it("resolve (responding fell to false) returns interrupting → idle", () => {
      const s = run([
        { type: "submit" },
        { type: "interrupt" },
        { type: "resolve" },
      ]);
      expect(s.interrupting).toBe(false);
      expect(selectStopStatus(s, false)).toBe("idle");
    });

    it("fallback timeout (resolve) returns interrupting → idle when responding never arrived", () => {
      // turn never started: no confirmed, just the fallback resolve.
      const s = run([
        { type: "submit" },
        { type: "interrupt" },
        { type: "resolve" },
      ]);
      expect(selectStopStatus(s, false)).toBe("idle");
    });

    it("interrupt is sticky — a second interrupt is a no-op", () => {
      const once = run([{ type: "submit" }, { type: "interrupt" }]);
      const twice = optimisticStopReducer(once, { type: "interrupt" });
      expect(twice).toBe(once);
    });

    it("timeout during interrupting is absorbed (stays interrupting)", () => {
      const s = run([
        { type: "submit" },
        { type: "interrupt" },
        { type: "timeout" },
      ]);
      expect(s.interrupting).toBe(true);
      expect(selectStopStatus(s, true)).toBe("interrupting");
    });

    it("interrupt from the confirmed streaming turn enters interrupting and absorbs responding", () => {
      const s = run([
        { type: "submit" },
        { type: "confirmed" },
        { type: "interrupt" },
      ]);
      expect(selectStopStatus(s, true)).toBe("interrupting");
    });

    it("after resolve, a fresh submit re-arms normally", () => {
      const s = run([
        { type: "submit" },
        { type: "interrupt" },
        { type: "resolve" },
        { type: "submit" },
      ]);
      expect(selectStopStatus(s, false)).toBe("submitted");
    });
  });
});
