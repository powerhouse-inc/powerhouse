import { AmountFieldProps } from "./amount-field";
import {
  AmountFiat,
  AmountFieldPropsGeneric,
  AmountCrypto,
  AmountCurrency,
  AmountValue,
} from "./types";
import { isValidNumber } from "../number-field/number-field-validations";
import { ValidatorResult } from "@/scalars";
import { isValidBigInt } from "./utils";

const isAmountCurrencyFiat = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountFiat" => type === "AmountFiat";

const isAmountCurrencyCrypto = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountCrypto" => type === "AmountCrypto";

const isAmountCurrencyUniversal = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountCurrency" => type === "AmountCurrency";

const getAmount = (
  value: AmountValue,
  type: AmountFieldPropsGeneric["type"],
): number | bigint | undefined => {
  if (
    isAmountCurrencyFiat(type) ||
    isAmountCurrencyCrypto(type) ||
    isAmountCurrencyUniversal(type)
  ) {
    if (!value) return undefined;
    return (
      (value as AmountFiat | AmountCrypto | AmountCurrency).amount ?? undefined
    );
  }
  return value as number;
};

export const validateAmount =
  ({ type, required, minValue, maxValue, allowNegative }: AmountFieldProps) =>
  (value: unknown): ValidatorResult => {
    const amount = getAmount(value as AmountValue, type);
    if (value === "") return true;
    if (amount?.toString() === "") {
      if (required) {
        return "This field is required";
      }
      return true;
    }
    if (amount === undefined) {
      if (required) {
        return "This field is required";
      }
      return true;
    }
    if (!isValidNumber(amount) && type !== "AmountCurrency") {
      return "Value is not a valid number";
    }
    if (!allowNegative && amount < 0) {
      return "Value must be positive";
    }
    if (type === "AmountCrypto") {
      if (!isValidBigInt(amount.toString())) {
        return "Value is not an bigint";
      }
      return true;
    }
    if (type === "AmountCurrency") {
      if (!isValidNumber(amount)) {
        return "Value is not a valid number";
      }
      if (Math.abs(Number(amount)) > Number.MAX_SAFE_INTEGER) {
        const amountStr = amount.toString();
        if (!/^\d+$/.test(amountStr)) {
          return "Value is not a valid bigint";
        }
        return true;
      }
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
    if (
      Math.abs(Number(amount)) > Number.MAX_SAFE_INTEGER &&
      (type === "AmountFiat" ||
        type === "AmountPercentage" ||
        type === "Amount")
    ) {
      return "Value is too large for number";
    }

    return true;
  };
