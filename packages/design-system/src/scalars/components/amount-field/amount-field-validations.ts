import { AmountFieldProps } from "./amount-field";
import {
  AmountCurrency,
  AmountFieldPropsGeneric,
  AmountToken,
  AmountValue,
} from "./types";
import { isValidNumber } from "../number-field/number-field-validations";
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
  ({ type }: AmountFieldProps) =>
  (value: unknown): ValidatorResult => {
    const amount = getAmount(value as AmountValue, type);
    // Check if the value is undefined or empty string
    if (amount === undefined) return true;

    if (!isValidNumber(amount)) {
      return "Value is not a valid number";
    }

    if (
      Math.abs(Number(amount)) > Number.MAX_SAFE_INTEGER &&
      type !== "AmountToken"
    ) {
      return "Value is too large for number";
    }

    return true;
  };
