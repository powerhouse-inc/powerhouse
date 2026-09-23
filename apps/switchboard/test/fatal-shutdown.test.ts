import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFatalErrorShutdown } from "../src/fatal-shutdown.mjs";

function makeProc() {
  const emitter = new EventEmitter();
  const proc = Object.assign(emitter, {
    pid: 1234,
    exitCode: undefined as number | undefined,
    kill: vi.fn((_pid: number, signal: string) => {
      emitter.emit(signal);
      return true;
    }),
    exit: vi.fn(),
  });
  return proc;
}

const logger = {
  error: vi.fn(),
} as unknown as Parameters<typeof installFatalErrorShutdown>[0];

describe("installFatalErrorShutdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["uncaughtException", "unhandledRejection"])(
    "routes %s through SIGTERM with exit code 1",
    (event) => {
      const proc = makeProc();
      const onSigterm = vi.fn();
      proc.on("SIGTERM", onSigterm);
      installFatalErrorShutdown(logger, proc as never);

      proc.emit(event, new Error("boom"));

      expect(proc.kill).toHaveBeenCalledWith(1234, "SIGTERM");
      expect(onSigterm).toHaveBeenCalledOnce();
      expect(proc.exitCode).toBe(1);
      expect(proc.exit).not.toHaveBeenCalled();
    },
  );

  it("signals once when a second fatal error arrives during shutdown", () => {
    const proc = makeProc();
    installFatalErrorShutdown(logger, proc as never);

    proc.emit("unhandledRejection", new Error("first"));
    proc.emit("uncaughtException", new Error("second"));

    expect(proc.kill).toHaveBeenCalledOnce();
  });

  it("forces exit 1 through the original exit when shutdown hangs", () => {
    vi.useFakeTimers();
    const proc = makeProc();
    const originalExit = proc.exit;
    installFatalErrorShutdown(logger, proc as never);
    // The builder swaps process.exit for a recording shim during shutdown.
    proc.exit = vi.fn();

    proc.emit("unhandledRejection", new Error("boom"));
    vi.advanceTimersByTime(15_000);

    expect(originalExit).toHaveBeenCalledWith(1);
    expect(proc.exit).not.toHaveBeenCalled();
  });

  it("installs its listeners once per process", () => {
    const proc = makeProc();
    installFatalErrorShutdown(logger, proc as never);
    installFatalErrorShutdown(logger, proc as never);

    expect(proc.listenerCount("uncaughtException")).toBe(1);
    expect(proc.listenerCount("unhandledRejection")).toBe(1);
  });
});
