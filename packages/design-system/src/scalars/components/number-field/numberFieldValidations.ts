import { AmountFieldProps } from "../amount-field/amount-field";
import { NumberFieldProps } from "./number-field";

interface ValidationProps {
  allowNegative?: boolean;
  isBigInt?: boolean;
  precision?: number;
  trailingZeros?: boolean;
  decimalRequired?: boolean;
}

export const validatePositive =
  ({ allowNegative }: ValidationProps) =>
  (value: unknown): true | string =>
    allowNegative || value === undefined || Number(value) >= 0
      ? true
      : "Value must be a positive value";

export const validateIsBigInt =
  ({ isBigInt }: ValidationProps) =>
  (value: unknown) => {
    const stringValue = String(value);
    const isLargeNumber =
      Math.abs(Number(stringValue)) > Number.MAX_SAFE_INTEGER;
    return isLargeNumber && !isBigInt
      ? "Value is too large for standard integer"
      : true;
  };

export const validatePrecision =
  ({ precision }: ValidationProps) =>
  (value: unknown) => {
    const stringValue = String(value);
    if (precision === undefined) {
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

export const validateTrailingZeros =
  ({ trailingZeros, precision }: ValidationProps) =>
  (value: unknown) => {
    const stringValue = String(value);
    if (!trailingZeros) return true;
    const hasTrailingZeros = stringValue.split(".")[1]?.length === precision;
    return hasTrailingZeros
      ? true
      : `Value must have exactly ${precision} decimal places`;
  };

export const validateDecimalRequired =
  ({ decimalRequired }: ValidationProps) =>
  (value: unknown) => {
    const stringValue = String(value);
    return decimalRequired && !stringValue.includes(".")
      ? "Value must include a decimal point"
      : true;
  };

export const mapToValidationProps = (
  componentProps: NumberFieldProps | AmountFieldProps,
): ValidationProps => {
  return {
    allowNegative: componentProps.allowNegative,
    isBigInt: componentProps.isBigInt,
    precision: componentProps.precision,
    trailingZeros: componentProps.trailingZeros,
    decimalRequired: componentProps.decimalRequired,
  };
};
