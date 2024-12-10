export const regex = /^-?\d*\.?\d*$/;
type TransformProps = {
  isBigInt?: boolean;
  trailingZeros?: boolean;
  precision?: number;
};

export function getDisplayValue(
  value?: bigint | number,
  transformProps?: TransformProps,
) {
  const {
    isBigInt = false,
    precision,
    trailingZeros = false,
  } = transformProps || {};

  // Return an empty string if value is empty
  if (!value) {
    return "";
  }

  // Handle the case when isBigInt is true
  if (isBigInt) {
    if (typeof value === "number" && !Number.isInteger(value)) {
      // If the value is a number with decimals, return it as-is without converting to BigInt
      return value;
    }

    return BigInt(value);
  } else {
    if (Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER) {
      //Remove the decimal places becasuse its a bigInt
      return BigInt(value);
    }
    if (precision !== undefined) {
      const formattedValue = parseFloat(String(value)).toFixed(precision);
      return trailingZeros
        ? formattedValue // keep the zeros
        : parseFloat(formattedValue); // delete the zeros and convert to number
    }

    return Number(value);
  }
}
