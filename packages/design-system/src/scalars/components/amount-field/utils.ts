import { Currency } from "../currency-code-field";
import { AmountFieldPropsGeneric } from "./types";
export const DEFAULT_FIAT_CURRENCIES: Currency[] = [
  { ticker: "USD", crypto: false, label: "USD", symbol: "$" },
  { ticker: "EUR", crypto: false, label: "EUR", symbol: "€" },
  { ticker: "GBP", crypto: false, label: "GBP", symbol: "£" },
];

export const DEFAULT_CRYPTO_CURRENCIES: Currency[] = [
  { ticker: "DAI", crypto: true, label: "DAI", symbol: "DAI" },
  { ticker: "ETH", crypto: true, label: "ETH", symbol: "ETH" },
  { ticker: "MKR", crypto: true, label: "MKR", symbol: "MKR" },
  { ticker: "SKY", crypto: true, label: "SKY", symbol: "SKY" },
  { ticker: "USDC", crypto: true, label: "USDC", symbol: "USDC" },
  { ticker: "USDS", crypto: true, label: "USDS", symbol: "USDS" },
];

export const DEFAULT_ALL_CURRENCIES: Currency[] = [
  ...DEFAULT_FIAT_CURRENCIES,
  ...DEFAULT_CRYPTO_CURRENCIES,
];
export const getDefaultUnits = (type: AmountFieldPropsGeneric["type"]) => {
  switch (type) {
    case "AmountFiat":
      return DEFAULT_FIAT_CURRENCIES;
    case "AmountCrypto":
      return DEFAULT_CRYPTO_CURRENCIES;
    case "AmountCurrency":
      return DEFAULT_ALL_CURRENCIES;
    default:
      return [];
  }
};

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

export const exampleUseAmountField = [
  {
    ticker: "lbs",
    crypto: false,
    label: "Lbs",
    symbol: "lbs",
  },
  {
    ticker: "kg",
    crypto: false,
    label: "Kg",
    symbol: "kg",
  },
  {
    ticker: "ptc",
    crypto: false,
    label: "Ptc",
    symbol: "ptc",
  },
];

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
