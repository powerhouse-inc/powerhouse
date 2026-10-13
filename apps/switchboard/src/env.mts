export function parseNonNegativeInt(
  raw: string | undefined,
  name: string,
): number | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0 || String(value) !== raw.trim()) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}
