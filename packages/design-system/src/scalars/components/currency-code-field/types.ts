export interface Currency {
  ticker: string;
  crypto: boolean;
  label?: string;
  symbol?: string;
  icon?: string;
}

export type CurrencyType = "Fiat" | "Crypto";
