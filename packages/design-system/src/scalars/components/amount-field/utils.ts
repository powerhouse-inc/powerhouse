import type { Currency } from "../currency-code-field/types.js";
import type { AmountFieldPropsGeneric, AmountValue } from "./types.js";

export const isValidBigInt = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  // Ensure the value contains only digits (no decimal points)
  const bigintRegex = /^\d+$/;
  return bigintRegex.test(value);
};

export const isValidNumberGreaterThanMaxSafeInteger = (
  value: string | undefined,
) => {
  if (!value) {
    return false;
  }
  const isValidBigIntValue = isValidBigInt(value);
  return (
    isValidBigIntValue && Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER
  );
};

export const isNotSafeValue = (value: string) => {
  return Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER;
};

export const displayValueAmount = (
  value?: string,
  precision?: number,
  viewPrecision?: number,
  trailingZeros?: boolean,
) => {
  if (!value) {
    return undefined; // Return undefined if no value is provided
  }

  // If viewPrecision is provided but not precision, format to viewPrecision
  if (viewPrecision !== undefined && precision === undefined) {
    const formattedValue = parseFloat(value).toFixed(viewPrecision);
    return trailingZeros
      ? formattedValue
      : parseFloat(formattedValue).toString();
  }

  // If precision is provided but not viewPrecision, truncate to precision
  if (precision !== undefined && viewPrecision === undefined) {
    const formattedValue = parseFloat(value).toFixed(precision);

    // If the number of decimals is greater than or equal to the precision, apply toFixed
    return parseFloat(formattedValue).toString();
  }

  // If both are present, show the value with viewPrecision when focused
  if (precision !== undefined && viewPrecision !== undefined) {
    const formattedValue = parseFloat(value).toFixed(viewPrecision);
    return trailingZeros ? formattedValue : parseFloat(formattedValue);
  }
  return value;
};

export const handleEventOnChange = <T>(value: T) => {
  const nativeEvent = new Event("change", { bubbles: true, cancelable: true });

  Object.defineProperty(nativeEvent, "target", {
    value: { value },

    writable: false,
  });

  return nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>;
};

export const handleEventOnBlur = <T>(value: T) => {
  const nativeEvent = new Event("blur", { bubbles: true, cancelable: true });

  Object.defineProperty(nativeEvent, "target", {
    value: { value },

    writable: false,
  });

  return nativeEvent as unknown as React.FocusEvent<HTMLInputElement>;
};

export const createAmountValue = (inputValue: string) => {
  return inputValue === "" ? undefined : inputValue;
};

export const isValidUnit = (
  type: AmountFieldPropsGeneric["type"],
  value: AmountValue,
  units?: Currency[],
) => {
  if (!units) return true;
  if (type === "Amount" && typeof value === "object" && "unit" in value) {
    return units.some((u) => u.ticker === value.unit);
  }
  if (type === "AmountCurrency" && typeof value === "object") {
    console.log("ebtre");
    return units.some((u) => u.ticker === value.unit);
  }
  if (type === "AmountCrypto" && typeof value === "object") {
    return units.some((u) => u.ticker === value.unit);
  }
  if (type === "AmountFiat" && typeof value === "object") {
    return units.some((u) => u.ticker === value.unit);
  }
  return false;
};
