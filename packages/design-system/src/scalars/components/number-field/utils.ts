export const regex = /^-?\d*\.?\d*$/;
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
    //Return a string no necessarily a BigInt, becase cast in onSubmit
    return value.toString();
  } else {
    if (Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER) {
      //Remove the decimal places because its a bigInt
      return value.toString();
    }
    if (precision !== undefined) {
      const formattedValue = parseFloat(value).toFixed(precision);

      return trailingZeros
        ? formattedValue // keep the zeros
        : parseFloat(formattedValue).toString(); // delete the zeros and convert to string
    }
    return value;
  }
}
