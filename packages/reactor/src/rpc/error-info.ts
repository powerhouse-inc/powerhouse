import type { ErrorInfo } from "./protocol.js";

const MAX_STACK_LENGTH = 8 * 1024;
const MAX_CAUSE_DEPTH = 8;

export function toErrorInfo(err: unknown, depth = 0): ErrorInfo {
  if (depth > MAX_CAUSE_DEPTH) {
    return { name: "Error", message: "cause chain truncated" };
  }
  if (err instanceof Error) {
    const info: ErrorInfo = { name: err.name || "Error", message: err.message };
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
        typeof record.message === "string"
          ? record.message
          : safeStringify(err),
    };
  }
  return { name: "Error", message: safeStringify(err) };
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
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
