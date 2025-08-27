import { cyan } from "colorette";
import { childLogger } from "document-drive";

// Create empty childLogger and manually prepend colored tag
const baseLogger = childLogger([]); // No automatic tags

export const logger = {
  debug: (...args: unknown[]): void =>
    baseLogger.debug(
      cyan("[CodegenProcessor]"),
      ...args.map((arg: unknown) =>
        typeof arg === "string" ? cyan(arg) : arg,
      ),
    ),
  info: (...args: unknown[]): void =>
    baseLogger.info(
      cyan("[CodegenProcessor]"),
      ...args.map((arg: unknown) =>
        typeof arg === "string" ? cyan(arg) : arg,
      ),
    ),
  warn: (...args: unknown[]): void =>
    baseLogger.warn(
      cyan("[CodegenProcessor]"),
      ...args.map((arg: unknown) =>
        typeof arg === "string" ? cyan(arg) : arg,
      ),
    ),
  error: (...args: unknown[]): void =>
    baseLogger.error(
      cyan("[CodegenProcessor]"),
      ...args.map((arg: unknown) =>
        typeof arg === "string" ? cyan(arg) : arg,
      ),
    ),
};
