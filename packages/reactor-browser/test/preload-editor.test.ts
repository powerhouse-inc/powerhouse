import { lazy } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorModule } from "document-model";
import {
  hasPreloadBandwidth,
  preloadEditorModule,
} from "../src/utils/preload-editor.js";

function asModule(Component: unknown): EditorModule {
  return { Component } as unknown as EditorModule;
}

function setConnection(value: unknown): void {
  Object.defineProperty(navigator, "connection", {
    value,
    configurable: true,
  });
}

afterEach(() => {
  // Remove the stub so unrelated tests see the real (absent) connection.
  delete (navigator as { connection?: unknown }).connection;
});

describe("hasPreloadBandwidth", () => {
  it("allows preloading when connection info is unavailable", () => {
    setConnection(undefined);
    expect(hasPreloadBandwidth()).toBe(true);
  });

  it("blocks preloading when data-saver is on", () => {
    setConnection({ saveData: true, effectiveType: "4g" });
    expect(hasPreloadBandwidth()).toBe(false);
  });

  it("blocks preloading on 2g / slow-2g", () => {
    setConnection({ saveData: false, effectiveType: "slow-2g" });
    expect(hasPreloadBandwidth()).toBe(false);
    setConnection({ saveData: false, effectiveType: "2g" });
    expect(hasPreloadBandwidth()).toBe(false);
  });

  it("allows preloading on a fast connection", () => {
    setConnection({ saveData: false, effectiveType: "4g" });
    expect(hasPreloadBandwidth()).toBe(true);
  });
});

describe("preloadEditorModule", () => {
  it("calls an explicit preload() hook when present", () => {
    const preload = vi.fn(() => Promise.resolve("done"));
    const Component = Object.assign(() => null, { preload });
    const result = preloadEditorModule(asModule(Component));
    expect(preload).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Promise);
  });

  it("triggers a React.lazy import and returns the in-flight promise", async () => {
    const ctor = vi.fn(() => Promise.resolve({ default: () => null }));
    const Component = lazy(ctor);

    const inflight = preloadEditorModule(asModule(Component));
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(inflight).toBeInstanceOf(Promise);

    await inflight;

    // Once loaded, re-preloading is a no-op and returns undefined.
    expect(preloadEditorModule(asModule(Component))).toBeUndefined();
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("returns undefined for a component with no lazy payload", () => {
    expect(preloadEditorModule(asModule(() => null))).toBeUndefined();
  });
});
