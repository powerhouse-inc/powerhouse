/**
 * Helpers for marshalling `Error` instances across the worker IPC boundary.
 *
 * Class instances cannot be structured-cloned, so {@link ErrorInfo} is the
 * canonical wire shape (see `protocol.ts`). These helpers walk `cause`
 * chains, truncate stacks, and drop non-cloneable fields.
 */

import type { ErrorInfo } from "./protocol.js";

const MAX_STACK_LENGTH = 8 * 1024;
const MAX_CAUSE_DEPTH = 8;

export function toErrorInfo(err: unknown, depth = 0): ErrorInfo {
  if (depth > MAX_CAUSE_DEPTH) {
    return { name: "Error", message: "cause chain truncated" };
  }
  if (err instanceof Error) {
    const info: ErrorInfo = {
      name: err.name || "Error",
      message: err.message,
    };
    if (typeof err.stack === "string") {
      info.stack =
        err.stack.length > MAX_STACK_LENGTH
          ? err.stack.slice(0, MAX_STACK_LENGTH)
          : err.stack;
    }
    if (err.cause !== undefined) {
      info.cause = toErrorInfo(err.cause, depth + 1);
    }
    return info;
  }
  if (typeof err === "string") {
    return { name: "Error", message: err };
  }
  if (err && typeof err === "object") {
    const record = err as { name?: unknown; message?: unknown };
    return {
      name: typeof record.name === "string" ? record.name : "Error",
      message:
        typeof record.message === "string" ? record.message : String(err),
    };
  }
  return { name: "Error", message: String(err) };
}

export function fromErrorInfo(info: ErrorInfo): Error {
  const err = new Error(info.message);
  Object.defineProperty(err, "name", {
    value: info.name,
    configurable: true,
    writable: true,
  });
  if (info.stack !== undefined) {
    err.stack = info.stack;
  }
  if (info.cause !== undefined) {
    Object.defineProperty(err, "cause", {
      value: fromErrorInfo(info.cause),
      configurable: true,
      writable: true,
    });
  }
  return err;
}
