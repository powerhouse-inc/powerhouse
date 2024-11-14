import { NumberFieldProps } from "./number-field";

export const validatePositive =
  (props: NumberFieldProps) => (value: string) => {
    return props.allowNegative
      ? true
      : Number(value) > 0
        ? true
        : "Value must be a poasdasdassitive value";
  };

export const validateIsBigInt =
  (props: NumberFieldProps) => (value: string) => {
    const isLargeNumber = Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER;
    return isLargeNumber && !props.isBigInt
      ? "Value is too large for standard integer"
      : true;
  };

export const validatePrecision =
  (props: NumberFieldProps) => (value: string) => {
    // Si precision no está definida, solo permitimos enteros
    if (props.precision === undefined) {
      return !value.includes(".") ? true : "Value must be an integer";
    }

    // Comprobamos la parte decimal del valor si se especifica precision
    const decimalPart = value.toString().split(".")[1];
    if (props.precision === 0) {
      return !decimalPart ? true : "Value must be an integer";
    }

    // Validamos la cantidad de decimales cuando precision está definida
    return decimalPart && decimalPart.length <= props.precision
      ? true
      : `Value must have ${props.precision} decimal places or fewer`;
  };

export const validateTrailingZeros =
  (props: NumberFieldProps) => (value: string) => {
    if (!props.trailingZeros) return true;
    const hasTrailingZeros =
      value.toString().split(".")[1]?.length === props.precision;
    return hasTrailingZeros
      ? true
      : `Value must have exactly ${props.precision} decimal places`;
  };

export const validateDecimalRequired =
  (props: NumberFieldProps) => (value: string) => {
    return props.decimalRequired && !value.includes(".")
      ? "Value must include a decimal point"
      : true;
  };
