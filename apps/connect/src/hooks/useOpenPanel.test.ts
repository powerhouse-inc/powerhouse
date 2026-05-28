// Plain module test — no DOM required.
// The module uses only module-level state, so `clearOpenPanelBuffer()` is
// called in `beforeEach` to give each test a clean slate.

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @openpanel/web so that importing client.ts (which requires it at the
// type level only) never actually loads the real SDK package.
vi.mock("@openpanel/web", () => ({
  OpenPanel: vi.fn(),
}));

import { resetOpenPanelClient } from "../services/openpanel/client.js";
import {
  clearOpenPanelBuffer,
  drainOpenPanelBuffer,
  track,
  useOpenPanel,
} from "./useOpenPanel.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeClient(trackImpl?: () => void) {
  return {
    track: trackImpl ? vi.fn(trackImpl) : vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("useOpenPanel / buffer", () => {
  beforeEach(() => {
    // Reset module state between tests.
    clearOpenPanelBuffer();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Pre-init track calls accumulate in the buffer
  // -------------------------------------------------------------------------
  it("accumulates pre-init track calls and drains them on init", () => {
    track("event.one", { a: 1 });
    track("event.two", { b: 2 });
    track("event.three", { c: 3 });

    const fake = makeFakeClient();
    drainOpenPanelBuffer(fake);

    expect(fake.track).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  // 2. Init drains buffered entries in FIFO order via client.track
  // -------------------------------------------------------------------------
  it("drains buffered entries in FIFO order", () => {
    track("first", { seq: 1 });
    track("second", { seq: 2 });
    track("third", { seq: 3 });

    const fake = makeFakeClient();
    drainOpenPanelBuffer(fake);

    expect(fake.track.mock.calls).toEqual([
      ["first", { seq: 1 }],
      ["second", { seq: 2 }],
      ["third", { seq: 3 }],
    ]);
  });

  // -------------------------------------------------------------------------
  // 3. Buffer cap — drop-oldest — under > 200 pre-init events
  // -------------------------------------------------------------------------
  it("enforces the 200-entry cap (drop-oldest) when > 200 events are buffered", () => {
    // Push 250 events numbered 0–249.
    for (let i = 0; i < 250; i++) {
      track(`event.${i}`, { index: i });
    }

    const fake = makeFakeClient();
    drainOpenPanelBuffer(fake);

    // Only 200 calls — the oldest 50 (0–49) were dropped.
    expect(fake.track).toHaveBeenCalledTimes(200);

    // First call corresponds to event #50 (oldest retained).
    expect(fake.track.mock.calls[0]).toEqual(["event.50", { index: 50 }]);

    // Last call corresponds to event #249 (newest).
    expect(fake.track.mock.calls[199]).toEqual(["event.249", { index: 249 }]);
  });

  // -------------------------------------------------------------------------
  // 4. resetOpenPanelClient() clears the buffer; subsequent init does not
  //    replay buffered events
  // -------------------------------------------------------------------------
  it("resetOpenPanelClient clears the buffer — subsequent init replays nothing", () => {
    track("before.reset", { x: 1 });
    track("also.before.reset", { x: 2 });

    // Simulate consent revocation / sign-out.
    resetOpenPanelClient();

    // Simulate a new init (e.g. user re-accepts consent).
    const fake = makeFakeClient();
    drainOpenPanelBuffer(fake);

    // Nothing should have been forwarded.
    expect(fake.track).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. client.track throws are swallowed
  // -------------------------------------------------------------------------
  it("swallows throws from client.track during drain", () => {
    track("event.boom", { fatal: true });
    track("event.after", { fatal: false });

    const throwingClient = makeFakeClient(() => {
      throw new Error("SDK kaboom");
    });

    // drainOpenPanelBuffer must not throw even if every forward() throws.
    expect(() => drainOpenPanelBuffer(throwingClient)).not.toThrow();

    // Both entries were attempted (drain is not aborted by a single throw).
    expect(throwingClient.track).toHaveBeenCalledTimes(2);
  });

  it("swallows throws from client.track on direct (post-init) track calls", () => {
    const throwingClient = makeFakeClient(() => {
      throw new Error("SDK kaboom");
    });

    // Drain with empty buffer to set activeClient.
    drainOpenPanelBuffer(throwingClient);

    // track() in the direct-forward path must not throw.
    expect(() => track("direct.event", {})).not.toThrow();
    expect(throwingClient.track).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 6. useOpenPanel() returns a stable object whose track is the module export
  // -------------------------------------------------------------------------
  it("useOpenPanel returns the stable api object with track function", () => {
    const result1 = useOpenPanel();
    const result2 = useOpenPanel();

    // Same reference — no new object per call.
    expect(result1).toBe(result2);
    expect(typeof result1.track).toBe("function");
  });

  // -------------------------------------------------------------------------
  // 7. Post-drain track() calls are forwarded directly without re-buffering
  // -------------------------------------------------------------------------
  it("forwards track() calls directly after init without buffering", () => {
    const fake = makeFakeClient();
    drainOpenPanelBuffer(fake);

    // Call track after the client is active.
    track("post.init", { tag: "live" });

    expect(fake.track).toHaveBeenCalledTimes(1);
    expect(fake.track).toHaveBeenCalledWith("post.init", { tag: "live" });
  });

  // -------------------------------------------------------------------------
  // 8. custom onError handler is called on client.track throw
  // -------------------------------------------------------------------------
  it("calls the provided onError handler when client.track throws during drain", () => {
    const onError = vi.fn();
    track("boom", {});

    const throwingClient = makeFakeClient(() => {
      throw new Error("oops");
    });

    drainOpenPanelBuffer(throwingClient, onError);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
