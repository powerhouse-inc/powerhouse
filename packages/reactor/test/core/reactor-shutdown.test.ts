import type { ILogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";

function recordingLogger(): ILogger & { errors: unknown[][] } {
  const errors: unknown[][] = [];
  const noop = () => undefined;
  const logger = {
    level: "error",
    verbose: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: (...args: unknown[]) => void errors.push(args),
    errorHandler: noop,
    child: () => logger,
    errors,
  };
  return logger as unknown as ILogger & { errors: unknown[][] };
}

/**
 * Captures the listeners `withSignalHandlers()` adds and stubs process.exit,
 * so the signal path runs by calling the listener rather than raising a real
 * signal inside vitest.
 */
function captureSignals() {
  const realExit = process.exit;
  const before = {
    SIGINT: new Set(process.listeners("SIGINT")),
    SIGTERM: new Set(process.listeners("SIGTERM")),
  };
  const exitCodes: Array<number | undefined> = [];
  let resolveExit: (code: number | undefined) => void = () => undefined;
  const exited = new Promise<number | undefined>((resolve) => {
    resolveExit = resolve;
  });
  process.exit = ((code?: number) => {
    exitCodes.push(code);
    resolveExit(code);
    return undefined as never;
  }) as typeof process.exit;

  const added = (signal: "SIGINT" | "SIGTERM") =>
    process
      .listeners(signal)
      .filter((listener) => !before[signal].has(listener)) as Array<
      (signal: NodeJS.Signals) => void
    >;

  return {
    exitCodes,
    exited,
    raise(signal: "SIGINT" | "SIGTERM") {
      const listeners = added(signal);
      expect(listeners).toHaveLength(1);
      listeners[0]!(signal);
    },
    restore() {
      process.exit = realExit;
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        for (const listener of added(signal)) {
          process.removeListener(signal, listener);
        }
      }
    },
  };
}

describe("InProcessReactorModule.shutdown", () => {
  let module: InProcessReactorModule | undefined;
  let signals: ReturnType<typeof captureSignals> | undefined;

  afterEach(async () => {
    signals?.restore();
    signals = undefined;
    vi.restoreAllMocks();
    // Every test shuts down through the memoized teardown, so this is a no-op
    // unless one failed before it did.
    await module?.shutdown().catch(() => undefined);
    module = undefined;
  });

  async function build(options: {
    hooks?: Array<() => Promise<void>>;
    signalHandlers?: boolean;
    logger?: ILogger;
    /** Receives "kill" and "destroy" as they happen. */
    order?: string[];
  }) {
    const builder = new ReactorBuilder().withLogger(
      options.logger ?? recordingLogger(),
    );
    for (const hook of options.hooks ?? []) builder.withShutdownHook(hook);
    if (options.signalHandlers) builder.withSignalHandlers();
    const built = await builder.buildModule();
    module = built;
    const realKill = built.reactor.kill.bind(built.reactor);
    const realDestroy = built.database.destroy.bind(built.database);
    const order = options.order ?? [];
    const kill = vi.spyOn(built.reactor, "kill").mockImplementation(() => {
      order.push("kill");
      return realKill();
    });
    const destroy = vi
      .spyOn(built.database, "destroy")
      .mockImplementation(async () => {
        order.push("destroy");
        await realDestroy();
      });
    return { module: built, kill, destroy, realKill, realDestroy };
  }

  it("runs kill, the hooks in order, then destroy, once across repeated and concurrent calls", async () => {
    const exit = vi.spyOn(process, "exit");
    const order: string[] = [];
    const { module, kill, destroy } = await build({
      order,
      hooks: [
        () => Promise.resolve(void order.push("hook-1")),
        () => Promise.resolve(void order.push("hook-2")),
      ],
    });

    const first = module.shutdown();
    const second = module.shutdown();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    await module.shutdown();

    expect(order).toEqual(["kill", "hook-1", "hook-2", "destroy"]);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(module.reactor.kill().isShutdown).toBe(true);
    expect(exit).not.toHaveBeenCalled();
  });

  it("logs a failing hook and still runs the rest and destroys the database", async () => {
    const logger = recordingLogger();
    const later = vi.fn(() => Promise.resolve());
    const { module, destroy } = await build({
      logger,
      hooks: [() => Promise.reject(new Error("hook boom")), later],
    });

    await module.shutdown();

    expect(later).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(logger.errors.map(([message]) => message)).toContain(
      "Shutdown hook failed:",
    );
  });

  it("rejects every caller when the reactor fails to stop, leaving hooks and database alone", async () => {
    const hook = vi.fn(() => Promise.resolve());
    const { module, kill, destroy, realKill, realDestroy } = await build({
      hooks: [hook],
    });
    const failure = new Error("kill boom");
    kill.mockReturnValueOnce({
      isShutdown: true,
      completed: Promise.reject(failure),
    });

    await expect(module.shutdown()).rejects.toBe(failure);
    await expect(module.shutdown()).rejects.toBe(failure);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(hook).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();

    // The memoized rejection keeps afterEach from tearing down; do it here.
    await realKill().completed;
    await realDestroy();
  });

  it("a signal after a programmatic shutdown exits without tearing down again", async () => {
    const hook = vi.fn(() => Promise.resolve());
    signals = captureSignals();
    const { module, kill, destroy } = await build({
      hooks: [hook],
      signalHandlers: true,
    });

    await module.shutdown();
    expect(signals.exitCodes).toEqual([]);

    signals.raise("SIGINT");
    expect(await signals.exited).toBe(0);

    expect(kill).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("a programmatic shutdown during a signal's teardown joins it", async () => {
    let releaseHook: () => void = () => undefined;
    const hookStarted = vi.fn();
    const hook = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          hookStarted();
          releaseHook = resolve;
        }),
    );
    signals = captureSignals();
    const { module, kill, destroy } = await build({
      hooks: [hook],
      signalHandlers: true,
    });

    signals.raise("SIGTERM");
    await vi.waitFor(() => expect(hookStarted).toHaveBeenCalled());
    const programmatic = module.shutdown();
    // A second signal while the first is draining is only logged.
    signals.raise("SIGTERM");
    releaseHook();
    await programmatic;

    expect(await signals.exited).toBe(0);
    expect(signals.exitCodes).toEqual([0]);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("the signal path exits 1 when the shared teardown fails", async () => {
    signals = captureSignals();
    const { module, kill, destroy, realDestroy } = await build({
      signalHandlers: true,
    });
    const failure = new Error("destroy boom");
    destroy.mockRejectedValueOnce(failure);

    signals.raise("SIGINT");
    expect(await signals.exited).toBe(1);
    await expect(module.shutdown()).rejects.toBe(failure);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);

    await realDestroy();
  });
});
