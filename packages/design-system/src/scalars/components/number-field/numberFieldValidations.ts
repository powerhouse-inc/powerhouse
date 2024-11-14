import { NumberFieldProps } from "./number-field";

export const validatePositive =
  (props: NumberFieldProps) => (value: string) => {
    return props.allowNegative
      ? true
      : Number(value) > 0
        ? true
        : "Value must be a positive value";
  };

export const validateIsBigInt =
  (props: NumberFieldProps) => (value: string) => {
    const isLargeNumber = Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER;
    return isLargeNumber && !props.isBigInt
      ? "Value is too large for standard integer"
      : true;
  };

export const validatePrecision =
  (props: NumberFieldProps) => (value: string) => {
    if (props.precision === undefined) return true;

    const decimalPart = value.toString().split(".")[1];
    if (props.precision === 0) {
      return !decimalPart ? true : "Value must be an integer";
    }

    return decimalPart && decimalPart.length <= props.precision
      ? true
      : `Value must have ${props.precision} decimal places or fewer`;
  };

export const validateTrailingZeros =
  (props: NumberFieldProps) => (value: string) => {
    if (!props.trailingZeros) return true;
    const hasTrailingZeros =
      value.toString().split(".")[1]?.length === props.precision;
    return hasTrailingZeros
      ? true
      : `Value must have exactly ${props.precision} decimal places with trailing zeros if needed`;
  };

export const validateDecimalRequired =
  (props: NumberFieldProps) => (value: string) => {
    return props.decimalRequired && !value.includes(".")
      ? "Value must include a decimal point"
      : true;
  };
