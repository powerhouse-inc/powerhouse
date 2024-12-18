import { NumericType } from "../components/number-field/types";

export const isPositiveOrUndefiend = (value: unknown): true | string =>
  value === undefined || Number(value) >= 0
    ? true
    : "Value must be a positive value";

export const isBigIntNumber = (
  value: unknown,
  numericType?: NumericType,
  isBigInt?: boolean,
) => {
  const floatsTypes = [
    "NegativeFloat",
    "PositiveFloat",
    "NonNegativeFloat",
    "NonPositiveFloat",
    "Float",
  ] as NumericType[];

  const integerTypes = [
    "PositiveInt",
    "NegativeInt",
    "NonNegativeInt",
    "NonPositiveInt",
    "BigInt",
    "Int",
  ] as NumericType[];

  const isFloat = numericType && floatsTypes.includes(numericType);
  const isInteger = numericType && integerTypes.includes(numericType);
  const stringValue = String(value);
  const isLargeNumber = Math.abs(Number(stringValue)) > Number.MAX_SAFE_INTEGER;

  // For float types, ignore isBigInt and only validate if it's a large number
  if (isFloat) {
    return isLargeNumber ? "Value is too large for float" : true;
  }

  // For integer types, allow large numbers only if isBigInt is true
  if (isInteger) {
    return isLargeNumber && !isBigInt ? "Value is too large for integer" : true;
  }

  return true;
};

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
