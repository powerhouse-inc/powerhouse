import type { Logger, LogLevel } from "./types.js";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const PREFIXES: Record<LogLevel, string> = {
  debug: "[DEBUG] ",
  info: "",
  warn: "[WARN] ",
  error: "[ERROR] ",
};

export function createLogger(
  level: LogLevel = "info",
  sink: (msg: string) => void = /* istanbul ignore next */ (msg) =>
    process.stderr.write(msg + "\n"),
): Logger {
  const threshold = LEVELS[level];
  function write(lvl: LogLevel, msg: string, args: unknown[]): void {
    if (LEVELS[lvl] < threshold) return;
    const formatted =
      args.length > 0
        ? `${PREFIXES[lvl]}${msg} ${args.map(String).join(" ")}`
        : `${PREFIXES[lvl]}${msg}`;
    sink(formatted);
  }
  return {
    level,
    debug: (msg, ...args) => write("debug", msg, args),
    info: (msg, ...args) => write("info", msg, args),
    warn: (msg, ...args) => write("warn", msg, args),
    error: (msg, ...args) => write("error", msg, args),
  };
}
