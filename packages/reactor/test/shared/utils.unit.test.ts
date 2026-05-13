import { afterEach, describe, expect, it, vi } from "vitest";
import {
  matchesScope,
  throwIfAborted,
  yieldToMain,
} from "../../src/shared/utils.js";

describe("matchesScope", () => {
  it("matches when scope is in view.scopes", () => {
    expect(matchesScope({ scopes: ["global", "local"] }, "global")).toBe(true);
  });

  it("does not match when scope is absent from view.scopes", () => {
    expect(matchesScope({ scopes: ["global"] }, "local")).toBe(false);
  });

  it("matches any scope when view.scopes is omitted", () => {
    expect(matchesScope({}, "anything")).toBe(true);
  });

  it("matches any scope when view is omitted entirely", () => {
    expect(matchesScope(undefined, "anything")).toBe(true);
  });
});

describe("yieldToMain", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).scheduler;
  });

  it("uses globalThis.scheduler.yield when available", async () => {
    const yieldFn = vi.fn().mockResolvedValue(undefined);
    (globalThis as Record<string, unknown>).scheduler = { yield: yieldFn };

    await yieldToMain();

    expect(yieldFn).toHaveBeenCalledOnce();
  });

  it("falls back to setTimeout(0) when scheduler is unavailable", async () => {
    (globalThis as Record<string, unknown>).scheduler = undefined;
    await expect(yieldToMain()).resolves.toBeUndefined();
  });

  it("falls back when scheduler exists but has no yield", async () => {
    (globalThis as Record<string, unknown>).scheduler = {};
    await expect(yieldToMain()).resolves.toBeUndefined();
  });
});

describe("throwIfAborted", () => {
  it("throws default Error when signal is aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrowError(
      "Operation aborted",
    );
  });

  it("uses the provided error factory when aborted", () => {
    class CustomAbort extends Error {
      constructor() {
        super("custom");
        this.name = "CustomAbort";
      }
    }
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      throwIfAborted(controller.signal, () => new CustomAbort()),
    ).toThrow(CustomAbort);
  });

  it("does not throw when signal is not aborted", () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
  });

  it("does not throw when signal is undefined", () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });
});
