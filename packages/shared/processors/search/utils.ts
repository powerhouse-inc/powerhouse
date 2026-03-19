const MAX_SEARCHABLE_LENGTH = 100_000;

/**
 * Recursively walks a JSON value and collects all string values
 * into a single space-separated string for full-text indexing.
 */
export function flattenToSearchableText(state: unknown): string {
  const parts: string[] = [];
  collect(state, parts);
  const joined = parts.join(" ");
  return joined.length > MAX_SEARCHABLE_LENGTH
    ? joined.slice(0, MAX_SEARCHABLE_LENGTH)
    : joined;
}

function collect(value: unknown, parts: string[]): void {
  if (value == null) return;

  if (typeof value === "string") {
    if (value.length > 0) {
      parts.push(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collect(item, parts);
    }
    return;
  }

  if (typeof value === "object") {
    for (const v of Object.values(value)) {
      collect(v, parts);
    }
  }
}
