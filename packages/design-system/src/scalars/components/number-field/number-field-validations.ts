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

export const isFloat = (value: unknown): boolean => {
  const number = Number(value);
  return !isNaN(number) && isFinite(number);
};

export const validateNumericType =
  ({ allowNegative = false, numericType }: NumberFieldProps) =>
  (value: unknown) => {
    const isPositive = Number(value) > 0;
    const isNegative = Number(value) < 0;
    const isInt = isInteger(value);

    switch (numericType) {
      case "PositiveInt": {
        if (!isInt) return "Value must be a positive integer";
        if (allowNegative) return true;
        if (isPositive) return true;
        return "Value must be a positive integer";
      }

      case "NegativeInt": {
        if (!isInt) return "Value must be a negative integer";
        if (Number(value) >= 0) return "Value must be a negative integer";
        if (isNegative) return true;
        return "Value must be a negative integer";
      }

      case "NonNegativeInt": {
        if (!isInt) return "Value must be a non-negative integer";
        if (allowNegative) return true;
        if (Number(value) >= 0) return true;
        return "Value must be a non-negative integer";
      }

      case "NonPositiveInt": {
        if (!isInt) return "Value must be a non-positive integer";
        if (Number(value) <= 0) return true;
        return "Value must be a non-positive integer";
      }

      case "PositiveFloat": {
        if (!isFloat(value)) return "Value must be a positive float ";
        if (allowNegative) return true;
        if (parseFloat(value as string) > 0) return true;
        return "Value must be a positive float";
      }

      case "NegativeFloat": {
        if (!isFloat(value)) return "Value must be a negative float";
        if (parseFloat(value as string) >= 0)
          return "Value must be a negative float";
        if (isNegative) return true;
        return "Value must be a negative float";
      }

      case "NonNegativeFloat": {
        if (!isFloat(value)) return "Value must be a non-negative float ";
        if (allowNegative) return true;
        if (parseFloat(value as string) >= 0) return true;
        return "Value must be a non-negative float";
      }

      case "NonPositiveFloat": {
        if (!isFloat(value)) return "Value must be a non-positive float";
        if (parseFloat(value as string) <= 0) return true;
        return "Value must be a non-positive float";
      }

      case "BigInt": {
        if (isInt) return true;
        return "This is not a valid BigInt";
      }

      default: {
        return true;
      }
    }
  };
