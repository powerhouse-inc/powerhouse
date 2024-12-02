import {
  applyPrecision,
  applyTransformations,
  enforceBigInt,
  enforceMaxSafeInteger,
  Transformation,
} from "./transformations";

export const regex = /^-?\d*\.?\d*$/;

type TransformProps = {
  isBigInt?: boolean;
  trailingZeros?: boolean;
  precision?: number;
};
export function getDisplayValue(
  value = "",
  transformProps?: TransformProps,
): string | number {
  const {
    isBigInt = false,
    precision,
    trailingZeros = false,
  } = transformProps || {};

  if (value === "") {
    return "";
  }

  const transformations: Transformation[] = [];

  if (isBigInt) {
    transformations.push(enforceBigInt);
  }

  transformations.push(enforceMaxSafeInteger);

  if (precision !== undefined) {
    transformations.push(applyPrecision(precision, trailingZeros));
  }

  return applyTransformations(value, transformations);
}
