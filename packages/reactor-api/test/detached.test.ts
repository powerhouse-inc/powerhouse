import type { ILogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDetached } from "../src/utils/detached.js";

function makeLogger() {
  const logger = {
    level: "error" as const,
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorHandler: vi.fn(),
    child: () => logger,
  };
  return logger satisfies ILogger;
}

const nextMacrotask = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe("runDetached", () => {
  const unhandled: unknown[] = [];
  const capture = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", capture);
  });

  afterEach(() => {
    process.off("unhandledRejection", capture);
  });

  it("logs and reports a synchronous throw", async () => {
    const logger = makeLogger();
    const report = vi.fn();
    const failure = new Error("sync failure");

    const run = runDetached(
      "Sync task",
      () => {
        throw failure;
      },
      { logger, report },
    );
    await expect(run).resolves.toBeUndefined();
    await nextMacrotask();

    expect(logger.error).toHaveBeenCalledWith(
      "@label failed: @error",
      "Sync task",
      failure,
    );
    expect(report).toHaveBeenCalledWith(failure);
    expect(unhandled).toEqual([]);
  });

  it("logs and reports a rejection", async () => {
    const logger = makeLogger();
    const report = vi.fn();
    const failure = new Error("async failure");

    void runDetached("Async task", () => Promise.reject(failure), {
      logger,
      report,
    });
    await nextMacrotask();

    expect(logger.error).toHaveBeenCalledWith(
      "@label failed: @error",
      "Async task",
      failure,
    );
    expect(report).toHaveBeenCalledWith(failure);
    expect(unhandled).toEqual([]);
  });

  it("keeps a throwing reporter from escaping", async () => {
    const logger = makeLogger();
    const reportFailure = new Error("report failed");

    const run = runDetached("Task", () => Promise.reject(new Error("boom")), {
      logger,
      report: () => {
        throw reportFailure;
      },
    });
    await expect(run).resolves.toBeUndefined();
    await nextMacrotask();

    expect(logger.error).toHaveBeenCalledWith(
      "Reporting a failure failed: @error",
      reportFailure,
    );
    expect(unhandled).toEqual([]);
  });

  it("stays quiet when the task succeeds", async () => {
    const logger = makeLogger();
    const report = vi.fn();

    await runDetached("Task", () => Promise.resolve(1), { logger, report });

    expect(logger.error).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});
