import { describe, it, expect } from "vitest";
import { createLogger } from "../src/core/logger.js";

describe("createLogger", () => {
  function captureSink() {
    const lines: string[] = [];
    return { lines, sink: (msg: string) => lines.push(msg) };
  }

  it("info level suppresses debug, passes info/warn/error", () => {
    const { lines, sink } = captureSink();
    const log = createLogger("info", sink);
    log.debug("hidden");
    log.info("visible");
    log.warn("also visible");
    log.error("also visible");
    expect(lines).toEqual([
      "visible",
      "[WARN] also visible",
      "[ERROR] also visible",
    ]);
  });

  it("debug level passes all levels", () => {
    const { lines, sink } = captureSink();
    const log = createLogger("debug", sink);
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(lines).toHaveLength(4);
  });

  it("error level suppresses debug/info/warn", () => {
    const { lines, sink } = captureSink();
    const log = createLogger("error", sink);
    log.debug("no");
    log.info("no");
    log.warn("no");
    log.error("yes");
    expect(lines).toEqual(["[ERROR] yes"]);
  });

  it("uses correct prefixes", () => {
    const { lines, sink } = captureSink();
    const log = createLogger("debug", sink);
    log.debug("msg");
    log.info("msg");
    log.warn("msg");
    log.error("msg");
    expect(lines[0]).toBe("[DEBUG] msg");
    expect(lines[1]).toBe("msg"); // info has no prefix
    expect(lines[2]).toBe("[WARN] msg");
    expect(lines[3]).toBe("[ERROR] msg");
  });

  it("appends extra args", () => {
    const { lines, sink } = captureSink();
    const log = createLogger("debug", sink);
    log.debug("path:", "/tmp/foo", 42);
    expect(lines[0]).toBe("[DEBUG] path: /tmp/foo 42");
  });

  it("exposes the configured level", () => {
    const log = createLogger("warn", () => {});
    expect(log.level).toBe("warn");
  });

  it("defaults to info level", () => {
    const { lines, sink } = captureSink();
    const log = createLogger(undefined, sink);
    log.debug("hidden");
    log.info("shown");
    expect(lines).toEqual(["shown"]);
  });
});
