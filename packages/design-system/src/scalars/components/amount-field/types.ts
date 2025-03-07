import { TokenIcons } from "./amount-field";

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

      currencySymbol?: never;
    }
  | {
      type: "AmountCurrencyFiat";
      value?: AmountCurrencyFiat;
      trailingZeros?: boolean;
      // Disable currencySymbol for AmountCurrencyFiat
      currencySymbol?: never;
    }
  | {
      type: "AmountPercentage";
      value?: AmountPercentage;
      trailingZeros?: boolean;
      currencySymbol?: never;
      tokenIcons?: never;
    }
  | {
      type: "AmountCurrencyCrypto";
      value?: AmountCurrencyCrypto;
      trailingZeros?: never;
      tokenIcons?: TokenIcons;
      currencySymbol?: never;
    }
  | {
      type: "AmountCurrencyUniversal";
      value?: AmountCurrencyUniversal;
      trailingZeros?: boolean;
      currencySymbol?: string;
    };

export type AmountValue =
  | Amount
  | AmountPercentage
  | AmountCurrencyFiat
  | AmountCurrencyCrypto
  | AmountCurrencyUniversal;
