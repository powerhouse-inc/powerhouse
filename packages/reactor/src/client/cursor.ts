const COMPOSITE_PREFIX = "c:";

/**
 * Returns true if the cursor is a composite multi-scope cursor.
 */
export function isCompositeCursor(cursor: string): boolean {
  return cursor.startsWith(COMPOSITE_PREFIX);
}

/**
 * Encodes per-scope cursors into a single composite cursor string.
 * Only scopes that still have more results should be included.
 */
export function encodeCompositeCursor(
  scopeCursors: Record<string, string>,
): string {
  return COMPOSITE_PREFIX + JSON.stringify(scopeCursors);
}

/**
 * Decodes a composite cursor string into a map of scope to cursor.
 * Throws if the cursor is not a valid composite cursor.
 */
export function decodeCompositeCursor(cursor: string): Record<string, string> {
  if (!cursor.startsWith(COMPOSITE_PREFIX)) {
    throw new Error("Invalid composite cursor format");
  }

  const json = cursor.slice(COMPOSITE_PREFIX.length);

  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Invalid composite cursor format");
    }
    return parsed as Record<string, string>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid composite cursor format");
    }
    throw error;
  }
}
