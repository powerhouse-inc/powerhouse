export { createForwardingLogger } from "./forwarding-logger.js";
export { errorToInfo, sanitizeArg } from "./sanitize.js";

function resolveWorkerEntryPath(): string {
  const url = new URL("./entry.js", import.meta.url);
  if (url.protocol !== "file:") {
    return url.href;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:[/\\]/.test(pathname)) {
    pathname = pathname.slice(1);
  }
  return pathname;
}

/** Absolute path to the worker entry script for use with `new Worker(workerEntryPath)`. */
export const workerEntryPath = resolveWorkerEntryPath();
