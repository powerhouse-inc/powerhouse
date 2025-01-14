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

export type AmountFieldPropsGeneric =
  | {
      type: "Amount";
      value?: Amount;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountCurrencyFiat";
      value?: AmountCurrencyFiat;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountPercentage";
      value?: AmountPercentage;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountCurrencyCrypto";
      value?: AmountCurrencyCrypto;
    };

export type AmountValue =
  | Amount
  | AmountPercentage
  | AmountCurrencyFiat
  | AmountCurrencyCrypto;
