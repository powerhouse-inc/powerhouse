export const getOptions = (items: string[] = []) => {
  return items.map((item) => ({
    value: item,
    label: item,
  }));
};

export const getCountryCurrencies = (allowedCurrencies: string[] = []) => {
  return getOptions(allowedCurrencies);
};

export const getTokens = (allowedTokens: string[] = []) => {
  return getOptions(allowedTokens);
};
