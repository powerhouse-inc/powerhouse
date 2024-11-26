import {
  hasDecimaPlace,
  isBigIntNumber,
  isPositiveOrUndefiend,
  isPrecisionZeroOrUndefiend,
  validateTrailing,
} from "@/scalars/validations/share-number-validations";
import { AmountFieldProps } from "./amount-field";
import { AmountType } from "../types";

export const validatePositiveAmount =
  ({ allowNegative }: AmountFieldProps) =>
  (value: AmountType): true | string => {
    const {
      details: { amount },
    } = value;
    return allowNegative || isPositiveOrUndefiend(amount);
  };

export const validateIsBigIntAmount =
  ({ isBigInt }: AmountFieldProps) =>
  (value: AmountType) => {
    const {
      details: { amount },
    } = value;
    return isBigInt || isBigIntNumber(amount);
  };

export const validatePrecisionAmount =
  ({ precision }: AmountFieldProps) =>
  (value: AmountType) => {
    const {
      details: { amount },
    } = value;
    return !precision || isPrecisionZeroOrUndefiend(amount, precision);
  };

export const validateTrailingZerosAmount =
  ({ trailingZeros, precision }: AmountFieldProps) =>
  (value: AmountType) => {
    const {
      details: { amount },
    } = value;
    return !trailingZeros || validateTrailing(amount, precision);
  };

export const validateDecimalRequiredAmount =
  ({ decimalRequired }: AmountFieldProps) =>
  (value: AmountType) => {
    const {
      details: { amount },
    } = value;
    return !decimalRequired || hasDecimaPlace(amount);
  };
