import { currencies } from "@/scalars/lib/currency-list";

export type CurrencyCode = (typeof currencies)[number];

export type Amount = number;
export type AmountPercentage = number;
export interface AmountCurrency {
  amount: number;
  currency: CurrencyCode;
}
export interface AmountToken {
  amount: bigint;
  token: string;
}

export type AmountFieldPropsGeneric =
  | { type: "Amount"; value?: Amount }
  | { type: "AmountCurrency"; value?: AmountCurrency }
  | { type: "AmountPercentage"; value?: AmountPercentage };

export type AmountValue = Amount | AmountPercentage | AmountCurrency;
