export const regex = /^-?\d*\.?\d*$/;

export const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

const formatValue = (
  value: string,
  precision?: number,
  trailingZeros?: boolean,
) => {
  const formattedValue = parseFloat(value).toFixed(precision);
  return trailingZeros ? formattedValue : parseFloat(formattedValue).toString();
};

type TransformProps = {
  isBigInt?: boolean;
  trailingZeros?: boolean;
  precision?: number;
};

export function getDisplayValue(
  value?: string,
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
    if (!Number.isInteger(Number(value))) {
      // If the value is a number with decimals, return it as-is
      return value;
    }
    // Add or remove the precision to the value when isBigInt is true
    return formatValue(value, precision, trailingZeros);
  } else {
    if (Math.abs(Number(value)) > MAX_SAFE_INTEGER) {
      // keep the value as a string to avoid convert to cientific notation
      return value.toString();
    }
    if (precision !== undefined) {
      return formatValue(value, precision, trailingZeros);
    }
    return value;
  }
}
