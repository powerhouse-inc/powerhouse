import {
  hasDecimaPlace,
  isBigIntNumber,
  isPositiveOrUndefiend,
  isPrecisionZeroOrUndefiend,
  validateTrailing,
} from "@/scalars/validations/share-number-validations";
import { NumberFieldProps } from "./number-field";

export const validatePositive =
  ({ allowNegative }: NumberFieldProps) =>
  (value: unknown): true | string => {
    return allowNegative || isPositiveOrUndefiend(value);
  };

export const validateIsBigInt =
  ({ isBigInt }: NumberFieldProps) =>
  (value: unknown) => {
    return isBigInt || isBigIntNumber(value);
  };

export const validatePrecision =
  ({ precision }: NumberFieldProps) =>
  (value: unknown) => {
    return !precision || isPrecisionZeroOrUndefiend(value, precision);
  };

export const validateTrailingZeros =
  ({ trailingZeros, precision }: NumberFieldProps) =>
  (value: unknown) => {
    return !trailingZeros || validateTrailing(value, precision);
  };

export const validateDecimalRequired =
  ({ decimalRequired }: NumberFieldProps) =>
  (value: unknown) => {
    return !decimalRequired || hasDecimaPlace(value);
  };
