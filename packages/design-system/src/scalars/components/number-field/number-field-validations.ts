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
        if (!allowNegative && Number(value) >= 0)
          return "Value must be a negative integer";
        if (isNegative) return true;
        return "Value must be a negative integer";
      }

      case "NonNegativeInt": {
        if (!isInt) return "Value must be a non-negative integer";
        if (!allowNegative && isNegative)
          return "Value must be a non-negative integer";
        if (Number(value) >= 0) return true;
        return "Value must be a non-negative integer";
      }

      case "NonPositiveInt": {
        if (!isInt) return "Value must be a non-positive integer";
        if (!allowNegative && Number(value) > 0)
          return "Value must be a non-positive integer";
        if (Number(value) <= 0) return true;
        return "Value must be a non-positive integer";
      }

      case "PositiveFloat": {
        if (!isFloat(value) && !isInt)
          return "Value must be a positive float or integer";
        if (!allowNegative && parseFloat(value as string) <= 0)
          return "Value must be a positive float or integer";
        if (parseFloat(value as string) > 0) return true;
        return "Value must be a positive float or integer";
      }

      case "NegativeFloat": {
        if (!isFloat(value) && !isInt)
          return "Value must be a negative float or integer";
        if (!allowNegative && parseFloat(value as string) >= 0)
          return "Value must be a negative float or integer";
        if (parseFloat(value as string) < 0) return true;
        return "Value must be a negative float or integer";
      }

      case "NonNegativeFloat": {
        if (!isFloat(value) && !isInt)
          return "Value must be a non-negative float or integer";
        if (!allowNegative && parseFloat(value as string) < 0)
          return "Value must be a non-negative float or integer";
        if (parseFloat(value as string) >= 0) return true;
        return "Value must be a non-negative float or integer";
      }

      case "NonPositiveFloat": {
        if (!isFloat(value) && !isInt)
          return "Value must be a non-positive float or integer";
        if (!allowNegative && parseFloat(value as string) > 0)
          return "Value must be a non-positive float or integer";
        if (parseFloat(value as string) <= 0) return true;
        return "Value must be a non-positive float or integer";
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
