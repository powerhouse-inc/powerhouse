export const regex = /^-?\d*\.?\d*$/;

export function getDisplayValue(
  value: number | string | undefined,
  isBigInt: boolean,
  trailingZeros: boolean,
  precision: number,
): string | number | undefined {
  if (isBigInt) {
    if (typeof value === "string") {
      return value.replace(/\D/g, "");
    }
    return BigInt(value ?? 0).toString();
  }

  if (typeof value === "number") {
    return trailingZeros ? value.toFixed(precision) : value;
  }

  return value;
}
