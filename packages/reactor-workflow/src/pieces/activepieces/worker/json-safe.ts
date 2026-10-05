// Everything the child sends crosses a structured-clone boundary. A piece's
// own objects routinely do not survive it, so they are flattened first.
export function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return String(value);
  }
}
