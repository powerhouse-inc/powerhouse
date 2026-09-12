/**
 * Pins that Vite's log lines reach the console verbatim.
 *
 * Vite's text is somebody else's prose, not an `ILogger` format string, and
 * its lines are full of npm scopes -- which is exactly the `@token`
 * substitution syntax. Forwarding a line as the format string rewrote it, and
 * forwarding Vite's second argument made `LogOptions` the replacement.
 */
import { ConsoleLogger } from "document-model";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViteLogger } from "../src/packages/vite-loader.mjs";

type ConsoleFn = (...args: unknown[]) => void;

describe("createViteLogger", () => {
  let infoSpy: MockInstance<ConsoleFn>;
  let warnSpy: MockInstance<ConsoleFn>;
  let errorSpy: MockInstance<ConsoleFn>;

  beforeEach(() => {
    infoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => {}) as unknown as MockInstance<ConsoleFn>;
    warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {}) as unknown as MockInstance<ConsoleFn>;
    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {}) as unknown as MockInstance<ConsoleFn>;
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const last = (spy: MockInstance<ConsoleFn>): string =>
    spy.mock.calls[spy.mock.calls.length - 1]?.[0] as string;

  it("keeps an npm scope in the message instead of substituting it", () => {
    const vite = createViteLogger(new ConsoleLogger());

    // The real line, and the one that came out as `pre-transforming
    // null/design-system` when the text was used as the format string.
    vite.info("pre-transforming @powerhousedao/design-system");

    expect(last(infoSpy)).toContain(
      "pre-transforming @powerhousedao/design-system",
    );
    expect(last(infoSpy)).not.toContain("null");
  });

  it("drops Vite's LogOptions rather than rendering it into the line", () => {
    const vite = createViteLogger(new ConsoleLogger());

    vite.info("pre-transforming @powerhousedao/design-system", {
      clear: false,
      timestamp: true,
    });
    expect(last(infoSpy)).toContain(
      "pre-transforming @powerhousedao/design-system",
    );
    expect(last(infoSpy)).not.toContain("clear");

    // A line with no token had the options appended as JSON instead.
    vite.warn("files in the public directory are served at the root path", {
      clear: true,
      timestamp: false,
    });
    expect(last(warnSpy)).toContain(
      "files in the public directory are served at the root path",
    );
    expect(last(warnSpy)).not.toContain("timestamp");
  });

  it("still reports the error Vite attaches to a failure", () => {
    const vite = createViteLogger(new ConsoleLogger());
    const error = new Error("Failed to resolve import");

    vite.error("Internal server error", { error });

    expect(last(errorSpy)).toContain("Internal server error");
    expect(last(errorSpy)).toContain("Failed to resolve import");
  });

  it("keeps the prefix the caller asked for", () => {
    const vite = createViteLogger(new ConsoleLogger(["reactor-api"]));
    vite.info("ready in 300 ms");
    expect(last(infoSpy)).toContain("[reactor-api]");
    expect(last(infoSpy)).toContain("ready in 300 ms");
  });
});
