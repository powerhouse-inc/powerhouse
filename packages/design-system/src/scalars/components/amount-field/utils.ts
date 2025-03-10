import { type TokenIcons } from "./amount-field.js";

export const getOptions = (items: string[] = []) => {
  return items.map((item) => ({
    value: item,
    label: item,
  }));
};

export const getCountryCurrencies = (allowedCurrencies: string[] = []) => {
  return getOptions(allowedCurrencies);
};

export const getTokens = (
  allowedTokens: string[] = [],
  tokenIcons?: TokenIcons,
) => {
  const options = allowedTokens.map((token) => {
    const iconFn = tokenIcons?.[token];

    return {
      value: token,
      label: token,
      icon: iconFn,
    };
  });

  return options;
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
