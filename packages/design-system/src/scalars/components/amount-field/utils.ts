import { TokenIcons } from "./amount-field";

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
