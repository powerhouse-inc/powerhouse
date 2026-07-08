import { describe, expect, it } from "vitest";
import type { ConnectionStateSnapshot } from "@powerhousedao/reactor-browser";
import { computeAuthGate } from "./use-drive-auth-gate.js";

// `state` + `requiresAuth` drive the decision; the rest are neutral.
function snap(
  state: ConnectionStateSnapshot["state"],
  requiresAuth = false,
): ConnectionStateSnapshot {
  return {
    state,
    failureCount: 0,
    lastSuccessUtcMs: 0,
    lastFailureUtcMs: 0,
    pushBlocked: false,
    pushFailureCount: 0,
    receivingPages: false,
    requiresAuth,
  };
}

describe("computeAuthGate", () => {
  it("returns 'unauthorized' when an authenticated user has an auth-rejected channel", () => {
    const states = new Map([["studio", snap("error", true)]]);
    expect(computeAuthGate(true, states)).toBe("unauthorized");
  });

  it("returns 'login' when an anonymous user has an auth-rejected channel", () => {
    const states = new Map([["studio", snap("error", true)]]);
    expect(computeAuthGate(false, states)).toBe("login");
  });

  it("does not gate on a non-auth error (anonymous)", () => {
    const states = new Map([["studio", snap("error", false)]]);
    expect(computeAuthGate(false, states)).toBeNull();
  });

  it("does not gate when all channels are healthy", () => {
    const states = new Map([
      ["studio", snap("connected")],
      ["other", snap("connecting")],
    ]);
    expect(computeAuthGate(false, states)).toBeNull();
  });

  it("does not gate with no channels", () => {
    expect(computeAuthGate(false, new Map())).toBeNull();
  });
});
