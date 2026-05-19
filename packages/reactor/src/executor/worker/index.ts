import { fileURLToPath } from "node:url";

export { createForwardingLogger } from "./forwarding-logger.js";
export { errorToInfo, sanitizeArg } from "./sanitize.js";

/** Absolute path to the worker entry script for use with `new Worker(workerEntryPath)`. */
export const workerEntryPath = fileURLToPath(
  new URL("./entry.js", import.meta.url),
);
