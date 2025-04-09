// add docs

import { type AllowedTypes } from "./types.js";

/**
 * Get the fiat currencies
 * @returns {Currency[]} The fiat currencies
 */
export const fiatCurrencies = () => [
  { ticker: "USD", crypto: false, label: "USD", symbol: "$" },
  { ticker: "EUR", crypto: false, label: "EUR", symbol: "€" },
  { ticker: "GBP", crypto: false, label: "GBP", symbol: "£" },
];

/**
 * Get the crypto currencies
 * @returns {Currency[]} The crypto currencies
 */
export const cryptoCurrencies = () => [
  { ticker: "DAI", crypto: true, label: "DAI", symbol: "DAI" },
  { ticker: "ETH", crypto: true, label: "ETH", symbol: "ETH" },
  { ticker: "MKR", crypto: true, label: "MKR", symbol: "MKR" },
  { ticker: "SKY", crypto: true, label: "SKY", symbol: "SKY" },
  { ticker: "USDC", crypto: true, label: "USDC", symbol: "USDC" },
  { ticker: "USDS", crypto: true, label: "USDS", symbol: "USDS" },
];

/**
 * Get the currencies
 * @returns {Currency[]} The currencies
 */
export const currencies = () => {
  return [...fiatCurrencies(), ...cryptoCurrencies()];
};

export const getCurrencies = (allowedTypes: AllowedTypes = "Both") => {
  switch (allowedTypes) {
    case "Fiat":
      return fiatCurrencies();
    case "Crypto":
      return cryptoCurrencies();
    case "Both":
      return currencies();
  }
};
