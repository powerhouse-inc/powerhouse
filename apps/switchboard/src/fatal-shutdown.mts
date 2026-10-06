import type { ILogger } from "document-model";

const FORCED_EXIT_MS = 15_000;

type FatalProcess = Pick<
  NodeJS.Process,
  "on" | "kill" | "exit" | "pid" | "listenerCount"
> & {
  exitCode?: NodeJS.Process["exitCode"];
};

const fatalHandlers = new WeakMap<
  FatalProcess,
  (kind: string, err: unknown) => void
>();

/**
 * Sends an uncaught exception or unhandled rejection through the SIGTERM
 * shutdown that `withSignalHandlers()` installs, so the reactor and read-model
 * PGlite stores close with a shutdown checkpoint before the process exits
 * with code 1. Node's default is to exit at once, which leaves both stores
 * to WAL recovery on the next open. A store whose wasm runtime aborted
 * (ENOSPC) rejects its close; the builder logs that and still exits. A
 * shutdown that hangs is cut off after FORCED_EXIT_MS.
 *
 * A rejection is fatal only when this is its sole listener: Node exits on an
 * unhandled rejection only when nothing listens for it, and Sentry's
 * listener deliberately keeps the process running.
 */
export function installFatalErrorShutdown(
  logger: ILogger,
  proc: FatalProcess = process,
): void {
  if (fatalHandlers.has(proc)) return;

  // Captured before shutdown starts: the builder replaces process.exit with a
  // recording shim while it drains.
  const realExit = proc.exit.bind(proc);
  let shuttingDown = false;

  /**
   * Logs without ever throwing. onFatal runs inside the uncaughtException
   * handler, so a logger whose transport is gone (EPIPE on a closed stdout)
   * would otherwise throw from the handler that reports throws, killing the
   * process before the shutdown it is supposed to run. A logging failure is
   * swallowed: there is nowhere left to report it.
   */
  const logFatal = (message: string, err?: unknown): void => {
    try {
      if (err === undefined) {
        logger.error(message);
      } else {
        logger.error(message, err);
      }
    } catch {
      // The log transport itself failed; shutdown must keep moving.
    }
  };

  const onFatal = (kind: string, err: unknown): void => {
    logFatal(`${kind}: @error`, err);
    if (shuttingDown) return;
    shuttingDown = true;
    proc.exitCode = 1;
    setTimeout(() => {
      logFatal("Shutdown after fatal error timed out; exiting");
      realExit(1);
    }, FORCED_EXIT_MS).unref();
    proc.kill(proc.pid, "SIGTERM");
  };
  fatalHandlers.set(proc, onFatal);

  proc.on("uncaughtException", (err) => onFatal("Uncaught exception", err));
  proc.on("unhandledRejection", (reason) => {
    if (proc.listenerCount("unhandledRejection") > 1) return;
    onFatal("Unhandled rejection", reason);
  });
}

/**
 * Routes a fatal condition the caller detected through the same shutdown as an
 * uncaught error. Returns false, and does nothing, when
 * `installFatalErrorShutdown` has not run for `proc`.
 */
export function triggerFatalShutdown(
  kind: string,
  err: unknown,
  proc: FatalProcess = process,
): boolean {
  const onFatal = fatalHandlers.get(proc);
  if (!onFatal) return false;
  onFatal(kind, err);
  return true;
}
