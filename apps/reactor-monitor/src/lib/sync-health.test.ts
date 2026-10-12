import type { ConnectionStateSnapshot } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STALE_THRESHOLD_MS,
  isConnectionLying,
} from "./sync-health.js";

const NOW = 1_000_000_000;

function snapshot(
  overrides: Partial<ConnectionStateSnapshot>,
): ConnectionStateSnapshot {
  return {
    state: "connected",
    failureCount: 0,
    lastSuccessUtcMs: 0,
    lastFailureUtcMs: 0,
    pushBlocked: false,
    pushFailureCount: 0,
    receivingPages: false,
    requiresAuth: false,
    ...overrides,
  };
}

describe("isConnectionLying", () => {
  it("flags connected with zero successful polls ever (the bug this guards against)", () => {
    const s = snapshot({ state: "connected", lastSuccessUtcMs: 0 });
    expect(isConnectionLying(s, NOW)).toBe(true);
  });

  it("flags connected whose last success is older than the stale threshold", () => {
    const s = snapshot({
      state: "connected",
      lastSuccessUtcMs: NOW - DEFAULT_STALE_THRESHOLD_MS - 1,
    });
    expect(isConnectionLying(s, NOW)).toBe(true);
  });

  it("does not flag connected with a recent success", () => {
    const s = snapshot({ state: "connected", lastSuccessUtcMs: NOW - 1_000 });
    expect(isConnectionLying(s, NOW)).toBe(false);
  });

  it("does not flag a non-connected state, even with lastSuccessUtcMs === 0", () => {
    for (const state of [
      "connecting",
      "disconnected",
      "reconnecting",
      "error",
    ] as const) {
      expect(
        isConnectionLying(snapshot({ state, lastSuccessUtcMs: 0 }), NOW),
      ).toBe(false);
    }
  });

  it("respects a custom stale threshold", () => {
    const s = snapshot({ state: "connected", lastSuccessUtcMs: NOW - 10_000 });
    expect(isConnectionLying(s, NOW, 5_000)).toBe(true);
    expect(isConnectionLying(s, NOW, 20_000)).toBe(false);
  });
});
