// Allows only numbers, optionally including a negative sign at the beginning and a decimal point.
export const regex = /^-?\d*\.?\d*$/;

export function getDisplayValue(
  value: number | string | undefined,
  isBigInt: boolean,
  trailingZeros: boolean,
  precision: number,
): string | number | undefined {
  if (isBigInt) {
    return BigInt(value ?? 0).toString();
  }

  if (typeof value === "number") {
    return trailingZeros ? value.toFixed(precision) : value;
  }

  return value;
}
