import { type Currency } from "../currency-code-field/types.js";
export type Amount = {
  amount: number;
  unit?: CurrencyTicker;
};
export type AmountPercentage = number | undefined;
export type CurrencyTicker = Currency["ticker"];

export interface AmountFiat {
  amount?: number;
  unit: CurrencyTicker;
}

export interface AmountCrypto {
  amount?: bigint;
  unit: CurrencyTicker;
}

export interface AmountCurrency {
  amount?: number | bigint;
  unit: CurrencyTicker;
}

export type AmountFieldPropsGeneric =
  | {
      type: "Amount";
      value?: Amount;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountFiat";
      value?: AmountFiat;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountPercentage";
      value?: AmountPercentage;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountCrypto";
      value?: AmountCrypto;
      trailingZeros?: never;
    }
  | {
      type: "AmountCurrency";
      value?: AmountCurrency;
      trailingZeros?: boolean;
    };

export type AmountValue =
  | Amount
  | AmountPercentage
  | AmountFiat
  | AmountCrypto
  | AmountCurrency;
