// Shim for deepmerge-ts (only the plain-object deep merge the builder uses).
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function deepmerge(...sources: unknown[]): unknown {
  let result: unknown = undefined;
  for (const source of sources) {
    if (isPlainObject(result) && isPlainObject(source)) {
      const merged: Record<string, unknown> = { ...result };
      for (const [key, value] of Object.entries(source)) {
        merged[key] =
          isPlainObject(merged[key]) && isPlainObject(value)
            ? deepmerge(merged[key], value)
            : value;
      }
      result = merged;
    } else {
      result = source;
    }
  }
  return result;
}
