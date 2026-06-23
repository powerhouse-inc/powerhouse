import { describe, expect, it } from "vitest";
import type { ConnectionStateSnapshot } from "@powerhousedao/reactor-browser";
import { computeNeedsLogin } from "./use-drive-auth-gate.js";

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

describe("computeNeedsLogin", () => {
  it("never gates an authenticated user, even with an auth-rejected channel", () => {
    const states = new Map([["studio", snap("error", true)]]);
    expect(computeNeedsLogin(true, states)).toBe(false);
  });

  it("gates an anonymous user when a channel failed with an auth rejection", () => {
    const states = new Map([["studio", snap("error", true)]]);
    expect(computeNeedsLogin(false, states)).toBe(true);
  });

  it("does not gate an anonymous user on a non-auth error", () => {
    const states = new Map([["studio", snap("error", false)]]);
    expect(computeNeedsLogin(false, states)).toBe(false);
  });

  it("does not gate an anonymous user when all channels are healthy", () => {
    const states = new Map([
      ["studio", snap("connected")],
      ["other", snap("connecting")],
    ]);
    expect(computeNeedsLogin(false, states)).toBe(false);
  });

  it("does not gate an anonymous user with no channels", () => {
    expect(computeNeedsLogin(false, new Map())).toBe(false);
  });
});
