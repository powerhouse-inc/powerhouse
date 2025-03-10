import { MAX_SAFE_INTEGER } from "./number-field-validations";
import { type NumericType } from "./types";

export const regex = /^-?\d*\.?\d*$/;

const floatTypes: NumericType[] = [
  "NegativeFloat",
  "PositiveFloat",
  "NonNegativeFloat",
  "NonPositiveFloat",
  "Float",
];

const formatValue = (
  value: string,
  precision?: number,
  trailingZeros?: boolean,
) => {
  const formattedValue = parseFloat(value).toFixed(precision);
  return trailingZeros ? formattedValue : parseFloat(formattedValue).toString();
};

type TransformProps = {
  numericType?: NumericType;
  trailingZeros?: boolean;
  precision?: number;
};

export function getDisplayValue(
  value?: string,
  transformProps?: TransformProps,
) {
  if (!value) return "";

  const {
    numericType,
    precision,
    trailingZeros = false,
  } = transformProps || {};

  const isFloat = numericType && floatTypes.includes(numericType);
  const numberValue = Number(value);

  if (numericType === "BigInt") {
    //Not need to convert a BigInt the convertion is done in the onSubmit
    return value;
  }
  //kee the value as its if a flaot and no precision is set
  if (isFloat && precision === 0) {
    return numberValue.toString();
  }

  //keep the value as its if the value is greater than the max safe integer
  // to avoid convert to cientific notation
  if (Math.abs(numberValue) > MAX_SAFE_INTEGER) {
    return value.toString();
  }

  if (precision !== 0) {
    return formatValue(value, precision, trailingZeros);
  }

  return value;
}
