import { describe, expect, it } from "vitest";
import type { ConnectionStateSnapshot } from "@powerhousedao/reactor-browser";
import { computeNeedsLogin } from "./use-drive-auth-gate.js";

// Only `state` drives the decision; the rest are filled with neutral values.
function snap(
  state: ConnectionStateSnapshot["state"],
): ConnectionStateSnapshot {
  return {
    state,
    failureCount: 0,
    lastSuccessUtcMs: 0,
    lastFailureUtcMs: 0,
    pushBlocked: false,
    pushFailureCount: 0,
    receivingPages: false,
  };
}

describe("computeNeedsLogin", () => {
  it("never gates an authenticated user, even with an errored channel", () => {
    const states = new Map([["studio", snap("error")]]);
    expect(computeNeedsLogin(true, states)).toBe(false);
  });

  it("gates an anonymous user when a channel is in error", () => {
    const states = new Map([["studio", snap("error")]]);
    expect(computeNeedsLogin(false, states)).toBe(true);
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
