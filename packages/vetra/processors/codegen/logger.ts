import { childLogger } from "document-model";

const baseLogger = childLogger(["Vetra"]);

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message;
      if (arg != null && typeof arg === "object") return JSON.stringify(arg);
      return `${arg as string | number | boolean}`;
    })
    .join(" ");
}

export const logger = {
  debug: (...args: unknown[]): void => baseLogger.debug(formatArgs(args)),
  info: (...args: unknown[]): void => baseLogger.info(formatArgs(args)),
  warn: (...args: unknown[]): void => baseLogger.warn(formatArgs(args)),
  error: (...args: unknown[]): void => baseLogger.error(formatArgs(args)),
};
