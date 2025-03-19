import { CurrencyType } from "./types.js";

const fiatCurrencies = [
  { ticker: "USD", crypto: false, label: "USD", symbol: "$" },
  { ticker: "EUR", crypto: false, label: "EUR", symbol: "€" },
  { ticker: "GBP", crypto: false, label: "GBP", symbol: "£" },
];

const cryptoCurrencies = [
  { ticker: "DAI", crypto: true, label: "DAI", symbol: "DAI" },
  { ticker: "ETH", crypto: true, label: "ETH", symbol: "ETH" },
  { ticker: "MKR", crypto: true, label: "MKR", symbol: "MKR" },
  { ticker: "SKY", crypto: true, label: "SKY", symbol: "SKY" },
  { ticker: "USDC", crypto: true, label: "USDC", symbol: "USDC" },
  { ticker: "USDS", crypto: true, label: "USDS", symbol: "USDS" },
];
export function getDefaultCurrencies(type: CurrencyType = CurrencyType.ALL) {
  if (type === CurrencyType.FIAT) return fiatCurrencies;
  if (type === CurrencyType.CRYPTO) return cryptoCurrencies;
  return [...fiatCurrencies, ...cryptoCurrencies];
}
