import { relative, resolve, sep } from "node:path";
import { globalLogger, type Logger } from "tsdown";
import type { BuildContext } from "./context.js";

/**
 * tsdown labels each file it writes with its directory, relative to the
 * package. Bundles written to the stage keep the labels of the output
 * directory they stand in for, so the log reads as without staging.
 */
export function stageLogger({
  projectRoot,
  outDir,
  session,
}: BuildContext): Logger {
  const shown = `${relative(projectRoot, resolve(projectRoot, outDir))}${sep}`;
  const written = `${relative(projectRoot, session.stage())}${sep}`;
  const label = (message: unknown) =>
    typeof message === "string" ? message.replaceAll(written, shown) : message;
  const relabel =
    (log: (...messages: unknown[]) => void) =>
    (...messages: unknown[]) =>
      log(...messages.map(label));
  return {
    get level() {
      return globalLogger.level;
    },
    set level(level) {
      globalLogger.level = level;
    },
    info: relabel((...m) => globalLogger.info(...m)),
    warn: relabel((...m) => globalLogger.warn(...m)),
    warnOnce: relabel((...m) => globalLogger.warnOnce(...m)),
    error: relabel((...m) => globalLogger.error(...m)),
    success: relabel((...m) => globalLogger.success(...m)),
    clearScreen: (type) => globalLogger.clearScreen(type),
  };
}
