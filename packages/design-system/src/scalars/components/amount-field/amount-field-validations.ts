import { type AmountFieldProps } from "./amount-field";
import {
  type AmountCurrencyFiat,
  type AmountFieldPropsGeneric,
  type AmountCurrencyCrypto,
  type AmountCurrencyUniversal,
  type AmountValue,
} from "./types";
import { isValidNumber } from "../number-field/number-field-validations";
import { type ValidatorResult } from "@/scalars";
import { isValidBigInt } from "./utils";

const isAmountCurrencyFiat = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountCurrencyFiat" => type === "AmountCurrencyFiat";

const isAmountCurrencyCrypto = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountCurrencyCrypto" => type === "AmountCurrencyCrypto";

const isAmountCurrencyUniversal = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountCurrencyUniversal" => type === "AmountCurrencyUniversal";

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
      (
        value as
          | AmountCurrencyFiat
          | AmountCurrencyCrypto
          | AmountCurrencyUniversal
      ).amount ?? undefined
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
    if (!isValidNumber(amount) && type !== "AmountCurrencyUniversal") {
      return "Value is not a valid number";
    }
    if (!allowNegative && amount < 0) {
      return "Value must be positive";
    }
    if (type === "AmountCurrencyCrypto") {
      if (!isValidBigInt(amount.toString())) {
        return "Value is not an bigint";
      }
      return true;
    }
    if (type === "AmountCurrencyUniversal") {
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
      (type === "AmountCurrencyFiat" ||
        type === "AmountPercentage" ||
        type === "Amount")
    ) {
      return "Value is too large for number";
    }

    return true;
  };
