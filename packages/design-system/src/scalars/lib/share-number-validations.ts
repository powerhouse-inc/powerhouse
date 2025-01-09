export const isPositiveOrUndefiend = (value: unknown): true | string =>
  value === undefined || Number(value) >= 0
    ? true
    : "Value must be a positive value";

export const isPrecisionZeroOrUndefiend = (
  value: unknown,
  precision?: number,
) => {
  const stringValue = String(value);
  if (!precision) {
    return !stringValue.includes(".") ? true : "Value must be an integer";
  }

  const decimalPart = stringValue.split(".")[1];
  if (precision === 0) {
    return !decimalPart ? true : "Value must be an integer";
  }

  return decimalPart && decimalPart.length <= precision
    ? true
    : `Value must have ${precision} decimal places or fewer`;
};

export const validateTrailing = (value: unknown, precision?: number) => {
  if (!precision) return true;
  const stringValue = String(value);
  const hasTrailingZeros = stringValue.split(".")[1]?.length === precision;

  return hasTrailingZeros
    ? true
    : `Value must have exactly ${precision} decimal places`;
};

export const hasDecimaPlace = (value: unknown) => {
  const stringValue = String(value);
  return stringValue.includes(".")
    ? true
    : "Value must include a decimal point";
};
