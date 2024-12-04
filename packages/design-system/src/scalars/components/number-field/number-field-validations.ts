import {
  isBigIntNumber,
  isPositiveOrUndefiend,
} from "@/scalars/lib/share-number-validations";
import { NumberFieldProps } from "./number-field";

export const validatePositive =
  ({ allowNegative }: NumberFieldProps) =>
  (value: unknown): true | string => {
    return allowNegative || isPositiveOrUndefiend(value);
  };

export const validateIsBigInt =
  ({ isBigInt, numericType }: NumberFieldProps) =>
  (value: unknown) => {
    return isBigInt || numericType === "BigInt" || isBigIntNumber(value);
  };

export const isInteger = (value: unknown): boolean =>
  Number.isInteger(Number(value));

export const isFloat = (value: unknown): boolean =>
  !Number.isInteger(Number(value));

export const validateNumericType =
  ({
    allowNegative = false,
    isBigInt = false,
    numericType = "PositiveInt",
  }: NumberFieldProps) =>
  (value: unknown) => {
    switch (numericType) {
      case "PositiveInt":
        return (isInteger(value) && Number(value) > 0) || allowNegative
          ? true
          : "Value must be a positive integer";
      case "NegativeInt": {
        return isInteger(value) && Number(value) < 0
          ? true
          : "Value must be a negative integer";
      }

      case "NonNegativeInt":
        return (isInteger(value) && Number(value) >= 0) || allowNegative
          ? true
          : "Value must be a non-negative integer";
      case "NonPositiveInt":
        return isInteger(value) && Number(value) <= 0
          ? true
          : "Value must be a non-positive integer";
      case "PositiveFloat":
        return (isFloat(value) && parseFloat(value as string) > 0) ||
          allowNegative
          ? true
          : "Value must be a positive float";
      case "NegativeFloat":
        return isFloat(value) && parseFloat(value as string) < 0
          ? true
          : "Value must be a negative float";
      case "NonNegativeFloat":
        return isFloat(value) && parseFloat(value as string) >= 0
          ? true
          : "Value must be a non-negative float";
      case "NonPositiveFloat":
        return isFloat(value) && parseFloat(value as string) <= 0
          ? true
          : "Value must be a non-positive float";
      case "BigInt": {
        return isBigInt || !isFloat(value) ? true : "This is not a vaid BigInt";
      }
    }
  };
