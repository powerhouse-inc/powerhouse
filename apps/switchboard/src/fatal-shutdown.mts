import type { ILogger } from "document-model";

const FORCED_EXIT_MS = 15_000;

type FatalProcess = Pick<
  NodeJS.Process,
  "on" | "kill" | "exit" | "pid" | "listenerCount"
> & {
  exitCode?: NodeJS.Process["exitCode"];
};

const installed = new WeakSet<FatalProcess>();

/**
 * Sends an uncaught exception or unhandled rejection through the SIGTERM
 * shutdown that `withSignalHandlers()` installs, so the reactor and read-model
 * PGlite stores write their snapshots before the process exits with code 1.
 * Node's default is to exit at once, which drops every write AtomicNodeFs has
 * not flushed yet. A shutdown that hangs is cut off after FORCED_EXIT_MS.
 *
 * A rejection is fatal only when this is its sole listener: Node exits on an
 * unhandled rejection only when nothing listens for it, and Sentry's
 * listener deliberately keeps the process running.
 */
export function installFatalErrorShutdown(
  logger: ILogger,
  proc: FatalProcess = process,
): void {
  if (installed.has(proc)) return;
  installed.add(proc);

  // Captured before shutdown starts: the builder replaces process.exit with a
  // recording shim while it drains.
  const realExit = proc.exit.bind(proc);
  let shuttingDown = false;

  const onFatal = (kind: string, err: unknown): void => {
    logger.error(`${kind}: @error`, err);
    if (shuttingDown) return;
    shuttingDown = true;
    proc.exitCode = 1;
    setTimeout(() => {
      logger.error("Shutdown after fatal error timed out; exiting");
      realExit(1);
    }, FORCED_EXIT_MS).unref();
    proc.kill(proc.pid, "SIGTERM");
  };

  proc.on("uncaughtException", (err) => onFatal("Uncaught exception", err));
  proc.on("unhandledRejection", (reason) => {
    if (proc.listenerCount("unhandledRejection") > 1) return;
    onFatal("Unhandled rejection", reason);
  });
}
