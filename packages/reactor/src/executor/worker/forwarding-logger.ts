import type { ILogger, LoggerErrorHandler } from "document-model";
import type { LogMessage } from "./protocol.js";
import { sanitizeArg } from "./sanitize.js";

export function createForwardingLogger(
  post: (msg: LogMessage) => void,
  level: ILogger["level"] = "info",
  tags: string[] = [],
): ILogger {
  function safePost(msg: LogMessage): void {
    try {
      post(msg);
    } catch {
      try {
        process.stderr.write(
          `[forwarding-logger] postMessage failed: ${msg.level} ${msg.message}\n`,
        );
      } catch {
        // nowhere left to report
      }
    }
  }

  function emit(
    wireLevel: LogMessage["level"],
    message: string,
    args: unknown[],
  ): void {
    const sanitizedArgs = args.map((a) => sanitizeArg(a));
    const finalArgs = tags.length > 0
      ? [sanitizeArg({ tags }), ...sanitizedArgs]
      : sanitizedArgs;
    safePost({
      type: "log",
      level: wireLevel,
      message,
      args: finalArgs,
      timestamp: Date.now(),
    });
  }

  return {
    level,
    verbose: (message, ...args) => emit("debug", message, args),
    debug: (message, ...args) => emit("debug", message, args),
    info: (message, ...args) => emit("info", message, args),
    warn: (message, ...args) => emit("warn", message, args),
    error: (message, ...args) => emit("error", message, args),
    errorHandler: ((...data: unknown[]) => {
      emit("error", String(data[0] ?? ""), data.slice(1));
    }) as LoggerErrorHandler,
    child: (childTags) =>
      createForwardingLogger(post, level, [...tags, ...childTags]),
  };
}
