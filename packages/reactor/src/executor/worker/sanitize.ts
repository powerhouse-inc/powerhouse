import type { ErrorInfo, SanitizedArg } from "./protocol.js";
import { toErrorInfo } from "./error-info.js";

const MAX_DEPTH = 8;

export function errorToInfo(err: unknown): ErrorInfo {
  return toErrorInfo(err);
}

export function sanitizeArg(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): SanitizedArg {
  if (depth > MAX_DEPTH) {
    return "[Truncated]";
  }

  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return null;

  if (value instanceof Error) {
    return toErrorInfo(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    const obj: { [key: string]: SanitizedArg } = {};
    for (const [k, v] of value.entries()) {
      obj[String(k)] = sanitizeArg(v, depth + 1, seen);
    }
    return obj;
  }

  if (value instanceof Set) {
    const arr: SanitizedArg[] = [];
    for (const v of value.values()) {
      arr.push(sanitizeArg(v, depth + 1, seen));
    }
    return arr;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result: SanitizedArg[] = value.map((v) =>
      sanitizeArg(v, depth + 1, seen),
    );
    seen.delete(value);
    return result;
  }

  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      const ctorName =
        (value as { constructor?: { name?: string } }).constructor?.name ||
        "Unknown";
      return { __nonClonable: ctorName };
    }

    if (seen.has(value as object)) return "[Circular]";
    seen.add(value as object);
    const result: { [key: string]: SanitizedArg } = {};
    for (const [k, v] of Object.entries(value as object)) {
      result[k] = sanitizeArg(v, depth + 1, seen);
    }
    seen.delete(value as object);
    return result;
  }

  return null;
}
