import type { PGliteErrorInfo } from "./protocol.js";

const MAX_STACK_LENGTH = 8 * 1024;
const MAX_CAUSE_DEPTH = 8;

/** The string fields of PGlite's `DatabaseError`, plus the query PGlite attaches. */
export const PG_ERROR_FIELDS = [
  "code",
  "severity",
  "detail",
  "hint",
  "position",
  "internalPosition",
  "internalQuery",
  "where",
  "schema",
  "table",
  "column",
  "dataType",
  "constraint",
  "file",
  "line",
  "routine",
  "query",
] as const;

/** Flattens an error and its cause chain into a structured-clonable shape. */
export function toPGliteErrorInfo(err: unknown, depth = 0): PGliteErrorInfo {
  if (depth > MAX_CAUSE_DEPTH) {
    return { name: "Error", message: "cause chain truncated", fields: {} };
  }
  if (!(err instanceof Error)) {
    return { name: "Error", message: describe(err), fields: {} };
  }
  const info: PGliteErrorInfo = {
    name: err.name || "Error",
    message: err.message,
    fields: pgFieldsOf(err),
  };
  if (typeof err.stack === "string") {
    info.stack = err.stack.slice(0, MAX_STACK_LENGTH);
  }
  if (err.cause !== undefined) {
    info.cause = toPGliteErrorInfo(err.cause, depth + 1);
  }
  return info;
}

/** Rebuilds an `Error` carrying the original name, stack, Postgres fields and cause chain. */
export function fromPGliteErrorInfo(info: PGliteErrorInfo): Error {
  const err = new Error(info.message);
  define(err, "name", info.name);
  if (info.stack !== undefined) {
    err.stack = info.stack;
  }
  for (const [key, value] of Object.entries(info.fields)) {
    define(err, key, value);
  }
  if (info.cause !== undefined) {
    define(err, "cause", fromPGliteErrorInfo(info.cause));
  }
  return err;
}

function pgFieldsOf(err: Error): Record<string, string> {
  const fields: Record<string, string> = {};
  const record = err as unknown as Record<string, unknown>;
  for (const key of PG_ERROR_FIELDS) {
    const value = record[key];
    if (typeof value === "string") {
      fields[key] = value;
    }
  }
  return fields;
}

function define(err: Error, key: string, value: unknown): void {
  Object.defineProperty(err, key, {
    value,
    configurable: true,
    writable: true,
    enumerable: key !== "name" && key !== "cause",
  });
}

function describe(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  if (value === undefined || typeof value === "function") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}
