interface ValidatorOptions {
  minValue?: number;
  maxValue?: number;
  allowNegative?: boolean;
  isBigInt?: boolean;
  numericType?: NumericType;
}
import { NumericType } from "../types";

export type ErrorMessage = string;
export type ValidatorResult = ErrorMessage | boolean;
export type ValidatorHandler = (
  value: any,
  formState: Record<string, any>,
) => ValidatorResult | Promise<ValidatorResult>;

interface ValidatorOptions {
  numericType?: NumericType;
  minValue?: number;
  maxValue?: number;
  step?: number;
  allowNegative?: boolean;
  precision?: number;
  trailingZeros?: boolean;
  decimalRequired?: boolean;
  isBigInt?: boolean;
}

export const numberCustomValidator: ValidatorHandler = (
  value: string,
  formState: ValidatorOptions,
): ValidatorResult => {
  const options: ValidatorOptions = formState; // Asumiendo que los 'options' vienen del 'formState'
  const errorMessages: string[] = [];

  // Convertir el valor a número
  const numericValue = options.isBigInt ? BigInt(value) : Number(value);
  console.log("Some stuff", numericValue);
  // if (isNaN(numericValue)) {
  //   errorMessages.push("Value must be a valid number.");
  // }

  console.log("value", numericValue, typeof numericValue);

  // Validación según el tipo numérico
  switch (formState.numericType) {
    case "PositiveInt":
      if (!Number.isInteger(numericValue) || numericValue <= 0) {
        console.log("ITs me");
        errorMessages.push("Value must be a positive integer.");
      }
      break;
    case "NegativeInt":
      if (!Number.isInteger(numericValue) || numericValue >= 0) {
        errorMessages.push("Value must be a negative integer.");
      }
      break;
    case "NonNegativeInt":
      if (!Number.isInteger(numericValue) || numericValue < 0) {
        errorMessages.push("Value must be a non-negative integer.");
      }
      break;
    case "NonPositiveInt":
      if (!Number.isInteger(numericValue) || numericValue > 0) {
        errorMessages.push("Value must be a non-positive integer.");
      }
      break;
    case "PositiveFloat":
      if (numericValue <= 0) {
        errorMessages.push("Value must be a positive float.");
      } else if (
        options.precision !== undefined &&
        !isPrecisionValid(value, options.precision)
      ) {
        errorMessages.push(
          `Value must have a precision of ${options.precision}.`,
        );
      }
      break;
    case "NegativeFloat":
      if (numericValue >= 0) {
        errorMessages.push("Value must be a negative float.");
      } else if (
        options.precision !== undefined &&
        !isPrecisionValid(value, options.precision)
      ) {
        errorMessages.push(
          `Value must have a precision of ${options.precision}.`,
        );
      }
      break;
    case "NonNegativeFloat":
      if (numericValue < 0) {
        errorMessages.push("Value must be a non-negative float.");
      } else if (
        options.precision !== undefined &&
        !isPrecisionValid(value, options.precision)
      ) {
        errorMessages.push(
          `Value must have a precision of ${options.precision}.`,
        );
      }
      break;
    case "NonPositiveFloat":
      if (numericValue > 0) {
        errorMessages.push("Value must be a non-positive float.");
      } else if (
        options.precision !== undefined &&
        !isPrecisionValid(value, options.precision)
      ) {
        errorMessages.push(
          `Value must have a precision of ${options.precision}.`,
        );
      }
      break;
    default:
      break;
  }

  // Si hay mensajes de error, devuelve el primero
  if (errorMessages.length > 0) {
    return errorMessages[0];
  }

  return true; // Valor válido
};

// New helper function to check precision
const isPrecisionValid = (value: string, precision: number): boolean => {
  const decimalPart = value.toString().split(".")[1];
  return decimalPart ? decimalPart.length <= precision : true;
};
