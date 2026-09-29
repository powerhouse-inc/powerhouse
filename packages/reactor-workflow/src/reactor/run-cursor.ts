// Opaque keyset cursor over the run listing: base64url of [started_at, id].
import type { RunKey } from "./store.js";

export class InvalidRunCursorError extends Error {
  constructor() {
    super("Invalid runs cursor");
    this.name = "InvalidRunCursorError";
  }
}

export function encodeRunCursor(key: RunKey): string {
  return Buffer.from(JSON.stringify([key.startedAt, key.id])).toString(
    "base64url",
  );
}

export function decodeRunCursor(cursor: string): RunKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidRunCursorError();
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new InvalidRunCursorError();
  }
  return { startedAt: parsed[0], id: parsed[1] };
}
