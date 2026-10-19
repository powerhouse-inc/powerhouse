import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installFatalErrorShutdown } from "../src/fatal-shutdown.mjs";
import { installObservabilitySignalHandlers } from "../src/observability-signals.mjs";

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

/** Lets the finally callback behind the flush promise run. */
async function settleMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("installObservabilitySignalHandlers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["SIGINT", "SIGTERM"])(
    "exits 0 after the flush on an ordinary %s",
    async (signal) => {
      const proc = makeProc();
      const flush = vi.fn(() => Promise.resolve());
      installObservabilitySignalHandlers(flush, proc as never);

      proc.emit(signal);
      await settleMicrotasks();

      expect(flush).toHaveBeenCalledOnce();
      expect(proc.exit).toHaveBeenCalledExactlyOnceWith(0);
    },
  );

  it("does not exit before the flush settles", async () => {
    const proc = makeProc();
    let finish: () => void = () => undefined;
    const flush = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    installObservabilitySignalHandlers(flush, proc as never);

    proc.emit("SIGTERM");
    await settleMicrotasks();
    expect(proc.exit).not.toHaveBeenCalled();

    finish();
    await settleMicrotasks();
    expect(proc.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("keeps exit code 1 when a fatal error raised the SIGTERM", async () => {
    vi.useFakeTimers();
    const proc = makeProc();
    const flush = vi.fn(() => Promise.resolve());
    // Production order: observability's handlers install at module load,
    // before the fatal handlers.
    installObservabilitySignalHandlers(flush, proc as never);
    installFatalErrorShutdown(logger, proc as never);

    proc.emit("uncaughtException", new Error("boom"));
    expect(proc.exitCode).toBe(1);
    await settleMicrotasks();

    // The flush ran, but observability never lowered the code to 0; the
    // process is still alive inside the fatal path's drain budget.
    expect(flush).toHaveBeenCalledOnce();
    expect(proc.exit).not.toHaveBeenCalled();

    // Fatal-shutdown's backstop owns the exit and preserves code 1.
    vi.advanceTimersByTime(15_000);
    expect(proc.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(proc.exit).not.toHaveBeenCalledWith(0);
    expect(proc.exitCode).toBe(1);
  });

  it("leaves the fatal drain budget intact even when the flush is slow", async () => {
    vi.useFakeTimers();
    const proc = makeProc();
    let finish: () => void = () => undefined;
    const flush = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    installObservabilitySignalHandlers(flush, proc as never);
    installFatalErrorShutdown(logger, proc as never);

    proc.emit("uncaughtException", new Error("boom"));

    // The flush gives up at its own ~5s budget (simulated by resolving it
    // here); that settling must not force an exit ahead of the drain.
    vi.advanceTimersByTime(5_000);
    finish();
    await settleMicrotasks();
    expect(proc.exit).not.toHaveBeenCalled();

    // Only the 15s fatal backstop ends the process, with code 1.
    vi.advanceTimersByTime(9_999);
    expect(proc.exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(proc.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("respects a non-zero exit code set by any other module", async () => {
    const proc = makeProc();
    proc.exitCode = 1;
    const flush = vi.fn(() => Promise.resolve());
    installObservabilitySignalHandlers(flush, proc as never);

    proc.emit("SIGTERM");
    await settleMicrotasks();

    expect(flush).toHaveBeenCalledOnce();
    expect(proc.exit).not.toHaveBeenCalled();
  });
});
