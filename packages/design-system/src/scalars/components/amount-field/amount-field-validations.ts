import { type ValidatorResult } from "#scalars";
import { isValidNumber } from "../number-field/number-field-validations.js";
import { type AmountFieldProps } from "./amount-field.js";
import {
  Amount,
  AmountCrypto,
  AmountCurrency,
  AmountFiat,
  AmountFieldPropsGeneric,
  AmountValue,
} from "./types.js";
import { isValidBigInt, isValidUnit } from "./utils.js";

const isAmountCurrencyFiat = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountFiat" => type === "AmountFiat";

const isAmountCurrencyCrypto = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountCrypto" => type === "AmountCrypto";

const isAmountCurrencyUniversal = (
  type: AmountFieldPropsGeneric["type"],
): type is "AmountCurrency" => type === "AmountCurrency";

const isAmount = (type: AmountFieldPropsGeneric["type"]): type is "Amount" =>
  type === "Amount";

const getAmount = (
  value: AmountValue,
  type: AmountFieldPropsGeneric["type"],
): number | bigint | undefined => {
  if (
    isAmountCurrencyFiat(type) ||
    isAmountCurrencyCrypto(type) ||
    isAmountCurrencyUniversal(type) ||
    isAmount(type)
  ) {
    if (!value) return undefined;
    return (
      (value as AmountFiat | AmountCrypto | AmountCurrency | Amount).amount ??
      undefined
    );
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
    units,
  }: AmountFieldProps) =>
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
    if (!isValidUnit(type, value as AmountValue, units)) {
      return "Select a valid currency";
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
