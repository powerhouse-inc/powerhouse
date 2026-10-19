// Signal handling for the observability bootstrap, split out of
// observability.mts so tests can exercise it without importing the module
// whose load-time side effects start Sentry and OpenTelemetry.

type SignalProcess = Pick<NodeJS.Process, "on" | "exit"> & {
  exitCode?: NodeJS.Process["exitCode"];
};

/**
 * Flushes telemetry on SIGINT/SIGTERM, then exits only when no other module
 * has claimed a failing exit.
 *
 * Exit ownership, decided here on purpose:
 *
 * - Ordinary signal (process.exitCode unset or 0): this handler exits with
 *   the current exit code after the flush settles (the flush bounds itself,
 *   see shutdown() in observability.mts). When the reactor builder's drain
 *   handler is also attached it runs first (prependListener) and swaps
 *   process.exit for a recording shim before this handler's exit call, so
 *   the drain still finishes and performs the real exit; when the builder is
 *   not attached (startup, signalHandlers: false), this exit is what
 *   terminates the process, with code 0.
 *
 * - Fatal shutdown in progress (process.exitCode already non-zero):
 *   fatal-shutdown.mts sets exitCode = 1 and arms a 15s forced exit BEFORE
 *   raising SIGTERM, precisely so the builder's drain can flush the PGlite
 *   snapshots. Calling exit here would lower that code to 0 (supervisors
 *   would see a crash as success) and, whenever the builder's shim is not in
 *   place, cut the drain off at this handler's shorter flush budget. So this
 *   handler never exits once a non-zero code is set: the exit belongs to the
 *   builder's drain, or failing that to fatal-shutdown's 15s backstop, both
 *   of which preserve code 1.
 */
export function installObservabilitySignalHandlers(
  flush: () => Promise<void>,
  proc: SignalProcess = process,
): void {
  const onSignal = () => {
    void flush().finally(() => {
      const code = proc.exitCode;
      if (code !== undefined && code !== 0) {
        return;
      }
      proc.exit(code ?? 0);
    });
  };
  proc.on("SIGINT", onSignal);
  proc.on("SIGTERM", onSignal);
}
