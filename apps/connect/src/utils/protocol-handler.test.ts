// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// connect.config reads runtime config at import time; stub it so the pure
// mapping can be tested in isolation with a known router basename.
vi.mock("../connect.config.js", () => ({
  connectConfig: { routerBasename: "/connect" },
}));

import {
  PROTOCOL_LAUNCH_EVENT,
  protocolLinkToPath,
} from "./protocol-handler.js";

describe("protocolLinkToPath", () => {
  it("maps web+ph://<rest> to a path under the router basename", () => {
    expect(protocolLinkToPath("web+ph://drive/abc")).toBe("/connect/drive/abc");
  });

  it("accepts the schemeless (single-colon) form", () => {
    expect(protocolLinkToPath("web+ph:drive/abc")).toBe("/connect/drive/abc");
  });

  it("falls back to the basename root for an empty rest", () => {
    expect(protocolLinkToPath("web+ph://")).toBe("/connect/");
  });

  it("returns null for a non web+ scheme", () => {
    expect(protocolLinkToPath("https://evil.example/x")).toBeNull();
    expect(protocolLinkToPath("mailto:a@b.c")).toBeNull();
  });

  it("normalizes slashes when joining", () => {
    expect(protocolLinkToPath("web+ph:///drive")).toBe("/connect/drive");
  });
});

describe("initProtocolHandler", () => {
  const originalHref = window.location.href;
  afterEach(() => {
    window.history.replaceState(null, "", originalHref);
    vi.restoreAllMocks();
    vi.resetModules();
  });
  beforeEach(() => {
    vi.resetModules();
  });

  it("a preventDefault() listener suppresses the built-in navigation", async () => {
    // Fresh module so the module-level `initialized` guard doesn't block us.
    vi.doMock("../connect.config.js", () => ({
      connectConfig: { routerBasename: "/connect" },
    }));
    const { initProtocolHandler } = await import("./protocol-handler.js");

    window.history.replaceState(
      null,
      "",
      `/connect?${"ph-protocol"}=${encodeURIComponent("web+ph://drive/abc")}`,
    );
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    window.addEventListener(PROTOCOL_LAUNCH_EVENT, (e) => e.preventDefault(), {
      once: true,
    });

    initProtocolHandler();

    // Exactly one replaceState (the marker strip); the default navigation's
    // second replaceState must not run because the listener cancelled it.
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toContain("ph-protocol");
  });
});
