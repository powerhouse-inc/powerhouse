import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installFatalErrorShutdown,
  triggerFatalShutdown,
} from "../src/fatal-shutdown.mjs";

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

  it("leaves an unhandled rejection to another listener, such as Sentry's", () => {
    const proc = makeProc();
    const other = vi.fn();
    proc.on("unhandledRejection", other);
    installFatalErrorShutdown(logger, proc as never);

    proc.emit("unhandledRejection", new Error("boom"));

    expect(other).toHaveBeenCalledOnce();
    expect(proc.kill).not.toHaveBeenCalled();
    expect(proc.exitCode).toBeUndefined();
  });

  it("still shuts down on an uncaught exception when another listener exists", () => {
    const proc = makeProc();
    proc.on("uncaughtException", vi.fn());
    installFatalErrorShutdown(logger, proc as never);

    proc.emit("uncaughtException", new Error("boom"));

    expect(proc.kill).toHaveBeenCalledWith(1234, "SIGTERM");
    expect(proc.exitCode).toBe(1);
  });

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

  it("still reaches exit when the logger itself throws EPIPE inside onFatal", () => {
    vi.useFakeTimers();
    const proc = makeProc();
    const onSigterm = vi.fn();
    proc.on("SIGTERM", onSigterm);
    const error = vi.fn(() => {
      throw Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    });
    const throwingLogger = { error } as unknown as Parameters<
      typeof installFatalErrorShutdown
    >[0];
    installFatalErrorShutdown(throwingLogger, proc as never);

    // Without the guard the EPIPE propagates out of the uncaughtException
    // listener, which in a real process re-enters fatal handling instead of
    // running the shutdown.
    expect(() =>
      proc.emit("uncaughtException", new Error("boom")),
    ).not.toThrow();

    expect(proc.kill).toHaveBeenCalledOnce();
    expect(onSigterm).toHaveBeenCalledOnce();
    expect(proc.exitCode).toBe(1);

    vi.advanceTimersByTime(15_000);

    expect(proc.exit).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(1);
    // Exactly the two guarded log attempts: the fatal report and the
    // forced-exit notice. A re-entered handler would log again.
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("routes a triggered fatal error through SIGTERM with exit code 1", () => {
    const proc = makeProc();
    const onSigterm = vi.fn();
    proc.on("SIGTERM", onSigterm);
    installFatalErrorShutdown(logger, proc as never);

    expect(
      triggerFatalShutdown("Flush failed", new Error("ENOSPC"), proc as never),
    ).toBe(true);
    triggerFatalShutdown("Flush failed", new Error("ENOSPC"), proc as never);
    proc.emit("uncaughtException", new Error("later"));

    expect(proc.kill).toHaveBeenCalledOnce();
    expect(onSigterm).toHaveBeenCalledOnce();
    expect(proc.exitCode).toBe(1);
  });

  it("ignores a trigger when shutdown on fatal errors is not installed", () => {
    const proc = makeProc();

    expect(
      triggerFatalShutdown("Flush failed", new Error("ENOSPC"), proc as never),
    ).toBe(false);
    expect(proc.kill).not.toHaveBeenCalled();
    expect(proc.exitCode).toBeUndefined();
  });

  it("installs its listeners once per process", () => {
    const proc = makeProc();
    installFatalErrorShutdown(logger, proc as never);
    installFatalErrorShutdown(logger, proc as never);

    expect(proc.listenerCount("uncaughtException")).toBe(1);
    expect(proc.listenerCount("unhandledRejection")).toBe(1);
  });
});
