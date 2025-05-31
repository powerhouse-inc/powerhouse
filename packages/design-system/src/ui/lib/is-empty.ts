export function isEmpty(value: unknown): boolean {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "number" && isNaN(value))
  ) {
    return true;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return false;
  }

  if (value instanceof RegExp || value instanceof Date) {
    return false; // Regex and Date are not considered empty
  }

  if (typeof value === "string" || Array.isArray(value)) {
    return value.length === 0;
  }

  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length === 0;
  }

  return false;
}
