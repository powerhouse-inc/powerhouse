import { NumberFieldProps } from "./number-field";

export const validatePositive =
  (props: NumberFieldProps) => (value: unknown) => {
    return props.allowNegative
      ? true
      : Number(value) > 0
        ? true
        : "Value must be a positive value";
  };

export const validateIsBigInt =
  (props: NumberFieldProps) => (value: unknown) => {
    const stringValue = String(value);
    const isLargeNumber =
      Math.abs(Number(stringValue)) > Number.MAX_SAFE_INTEGER;
    return isLargeNumber && !props.isBigInt
      ? "Value is too large for standard integer"
      : true;
  };

export const validatePrecision =
  (props: NumberFieldProps) => (value: unknown) => {
    const stringValue = String(value);
    if (props.precision === undefined) {
      return !stringValue.includes(".") ? true : "Value must be an integer";
    }

    const decimalPart = stringValue.split(".")[1];
    if (props.precision === 0) {
      return !decimalPart ? true : "Value must be an integer";
    }

    return decimalPart && decimalPart.length <= props.precision
      ? true
      : `Value must have ${props.precision} decimal places or fewer`;
  };

export const validateTrailingZeros =
  (props: NumberFieldProps) => (value: unknown) => {
    const stringValue = String(value);
    if (!props.trailingZeros) return true;
    const hasTrailingZeros =
      stringValue.split(".")[1]?.length === props.precision;
    return hasTrailingZeros
      ? true
      : `Value must have exactly ${props.precision} decimal places`;
  };

export const validateDecimalRequired =
  (props: NumberFieldProps) => (value: unknown) => {
    const stringValue = String(value);
    return props.decimalRequired && !stringValue.includes(".")
      ? "Value must include a decimal point"
      : true;
  };
