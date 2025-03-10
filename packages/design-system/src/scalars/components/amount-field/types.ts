import { type TokenIcons } from "./amount-field.js";

export type Amount = number | undefined;
export type AmountPercentage = number | undefined;
export interface AmountCurrencyFiat {
  amount?: number;
  currency: string;
}
export interface AmountCurrencyCrypto {
  amount?: bigint;
  currency: string;
}
export interface AmountCurrencyUniversal {
  amount?: number | bigint; // Accept high-precision values
  currency: string;
}

export type AmountFieldPropsGeneric =
  | {
      type: "Amount";
      value?: Amount;
      trailingZeros?: boolean;
      allowedCurrencies?: never;
      currencySymbol?: never;
      allowedTokens?: never;
      tokenIcons?: never;
    }
  | {
      type: "AmountCurrencyFiat";
      value?: AmountCurrencyFiat;
      trailingZeros?: boolean;
      allowedCurrencies: string[];
      // Disable currencySymbol for AmountCurrencyFiat
      currencySymbol?: never;
      allowedTokens?: never;
      tokenIcons?: never;
    }
  | {
      type: "AmountPercentage";
      value?: AmountPercentage;
      trailingZeros?: boolean;
      allowedCurrencies?: never;
      currencySymbol?: never;
      allowedTokens?: never;
      tokenIcons?: never;
    }
  | {
      type: "AmountCurrencyCrypto";
      value?: AmountCurrencyCrypto;
      trailingZeros?: never;
      allowedTokens?: string[];
      tokenIcons?: TokenIcons;
      allowedCurrencies?: never;
      currencySymbol?: never;
    }
  | {
      type: "AmountCurrencyUniversal";
      value?: AmountCurrencyUniversal;
      trailingZeros?: boolean;
      allowedCurrencies?: string[];
      currencySymbol?: string;
      allowedTokens?: string[];
      tokenIcons?: TokenIcons;
    };

export type AmountValue =
  | Amount
  | AmountPercentage
  | AmountCurrencyFiat
  | AmountCurrencyCrypto
  | AmountCurrencyUniversal;
