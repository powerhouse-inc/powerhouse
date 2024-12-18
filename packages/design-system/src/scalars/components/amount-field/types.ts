export type Amount = number;
export type AmountPercentage = number;
export interface AmountCurrency {
  amount: number;
  currency: string;
}
export interface AmountToken {
  amount: bigint;
  token: string;
}

export type AmountFieldPropsGeneric =
  | { type: "Amount"; value?: Amount }
  | { type: "AmountCurrency"; value?: AmountCurrency }
  | { type: "AmountPercentage"; value?: AmountPercentage }
  | { type: "AmountToken"; value?: AmountToken };

export type AmountValue =
  | Amount
  | AmountPercentage
  | AmountCurrency
  | AmountToken;
