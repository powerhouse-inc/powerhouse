import {
  isPrecisionZeroOrUndefiend,
  validateTrailing,
} from "@/scalars/lib/share-number-validations";
import { AmountFieldProps } from "./amount-field";
import { AmountCurrency, AmountValue } from "./types";

export const validatePrecisionAmount =
  ({ precision, type }: AmountFieldProps) =>
  (value: AmountValue) => {
    const amount =
      type === "AmountCurrency" ? (value as AmountCurrency).amount : value;
    return !precision || isPrecisionZeroOrUndefiend(amount, precision);
  };

export const validateTrailingZerosAmount =
  ({ trailingZeros, precision, type }: AmountFieldProps) =>
  (value: AmountValue) => {
    const amount =
      type === "AmountCurrency" ? (value as AmountCurrency).amount : value;
    return !trailingZeros || validateTrailing(amount, precision);
  };
