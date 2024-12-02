export const regex = /^-?\d*\.?\d*$/;
export const validNumber = /^-?\d+$/;

type TransformProps = {
  isBigInt?: boolean;
  trailingZeros?: boolean;
  precision?: number;
};

export function getDisplayValue(
  value = "",
  transformProps?: TransformProps,
): string | number {
  const {
    isBigInt = false,
    precision,
    trailingZeros = false,
  } = transformProps || {};

  // Return an empty string if value is empty
  if (value === "") {
    return "";
  }

  // Handle the case when isBigInt is true
  if (isBigInt) {
    const newValue = value.toString().replace(/[^-\d.]/g, "");
    // Remove the decimal part if it exists and keep only the integer part
    const integerPart = newValue.split(".")[0];

    if (!validNumber.test(integerPart)) {
      return "";
    }
    return BigInt(integerPart).toString();
  }

  // Check if the value exceeds MAX_SAFE_INTEGER and is not BigInt
  const numericValue = parseFloat(value);
  if (numericValue > Number.MAX_SAFE_INTEGER) {
    const newValue = value.toString().replace(/[^-\d.]/g, "");
    return newValue; // Return the value as a string without conversion
  }

  // Handle precision and trailing zeros if specified
  if (precision !== undefined) {
    console.log("hello");
    const formattedValue = numericValue.toFixed(precision);
    return trailingZeros
      ? formattedValue
      : parseFloat(formattedValue).toString();
  }

  return numericValue.toString();
}
