import { type Currency } from "./types";

export const commonFiatCurrencies: Currency[] = [
  {
    ticker: "EUR",
    crypto: false,
    label: "Euro",
    symbol: "€",
  },
  {
    ticker: "USD",
    crypto: false,
    label: "United States Dollar",
    symbol: "$",
  },
  {
    ticker: "THB",
    crypto: false,
    label: "Thai Baht",
  },
];

export const commonCryptoCurrencies: Currency[] = [
  {
    ticker: "BTC",
    crypto: true,
    label: "Bitcoin",
    symbol: "₿",
  },
  {
    ticker: "ETH",
    crypto: true,
    label: "Ether",
    symbol: "Ξ",
  },
  {
    ticker: "USDS",
    crypto: true,
    label: "Sky USD",
  },
  {
    ticker: "USDC",
    crypto: true,
  },
];
