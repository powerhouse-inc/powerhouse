export type Transformation = (value: string | number) => string | number;
const validNumber = /^-?\d+$/;
export const applyTransformations = (
  value: string | number,
  transformations: Transformation[],
): string | number => {
  return transformations.reduce((acc, transform) => transform(acc), value);
};

export const applyBigInt = (value: string | number): string | number => {
  const stringValue = value.toString().replace(/[^-\d.]/g, "");
  const integerPart = stringValue.split(".")[0];
  return validNumber.test(integerPart) ? BigInt(integerPart).toString() : "";
};

export const applyMaxSafeInteger = (
  value: string | number,
): string | number => {
  const numericValue = parseFloat(value.toString());
  return numericValue > Number.MAX_SAFE_INTEGER
    ? value.toString().replace(/[^-\d.]/g, "")
    : value;
};

export const applyPrecision = (precision: number, trailingZeros = false) => {
  return (value: string | number): string | number => {
    const numericValue = parseFloat(value.toString());
    const formattedValue = numericValue.toFixed(precision);
    return trailingZeros
      ? formattedValue
      : parseFloat(formattedValue).toString();
  };
};
