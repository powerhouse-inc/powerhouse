import { AmountFieldProps } from "./amount-field";
import {
  AmountCurrency,
  AmountFieldPropsGeneric,
  AmountToken,
  AmountValue,
} from "./types";
import {
  isInteger,
  isValidNumber,
} from "../number-field/number-field-validations";
import { ValidatorResult } from "@/scalars";

const isAmountCurrency = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountCurrency" => type === "AmountCurrency";

const isAmountToken = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountToken" => type === "AmountToken";

const getAmount = (
  value: AmountValue,
  type: AmountFieldPropsGeneric["type"],
): number | bigint | undefined => {
  if (isAmountCurrency(type) || isAmountToken(type)) {
    return (value as AmountCurrency | AmountToken).amount;
  }

  return value as number;
};

export const validateAmount =
  ({
    type,
    required,
    minValue,
    maxValue,
    allowNegative,
    pattern,
  }: AmountFieldProps) =>
  (value: unknown): ValidatorResult => {
    const amount = getAmount(value as AmountValue, type);
    if (value === "") return true;
    if (amount === undefined) {
      if (required) {
        return "This field is required";
      }
      return true;
    }
    if (!isValidNumber(amount) && type !== "AmountToken") {
      return "Value is not a valid number";
    }
    if (!allowNegative && amount < 0) {
      return "Value must be positive";
    }
    if (type === "AmountToken") {
      if (!isInteger(amount)) {
        return "Value is not an bigint";
      }
      return true;
    }
    if (maxValue) {
      if (amount > maxValue) {
        return `This field must be less than ${maxValue}`;
      }
    }
    if (minValue) {
      if (amount < minValue) {
        return `This field must be more than ${minValue}`;
      }
    }
    if (pattern) {
      if (!new RegExp(pattern).test(amount as unknown as string)) {
        return `This field must match the pattern ${pattern}`;
      }
    }

    if (Math.abs(Number(amount)) > Number.MAX_SAFE_INTEGER) {
      return "Value is too large for number";
    }

    return true;
  };
