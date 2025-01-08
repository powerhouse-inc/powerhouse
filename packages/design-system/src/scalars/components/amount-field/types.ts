export type Amount = number | undefined;
export type AmountPercentage = number | undefined;
export interface AmountCurrency {
  amount?: number;
  currency: string;
}
export interface AmountToken {
  amount?: bigint;
  token: string;
}

export type AmountFieldPropsGeneric =
  | {
      type: "Amount";
      value?: Amount;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountCurrency";
      value?: AmountCurrency;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountPercentage";
      value?: AmountPercentage;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountToken";
      value?: AmountToken;
    };

export type AmountValue =
  | Amount
  | AmountPercentage
  | AmountCurrency
  | AmountToken;
