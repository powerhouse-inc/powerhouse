import { AmountValue } from "../components/amount-field/types";

export type ValueCast =
  | "BigInt"
  | "Number"
  | "URLTrim"
  | "AmountNumber"
  | "AmountBigInt";

export const castFunctions: Record<ValueCast, (value: any) => any> = {
  BigInt: (value: string) => BigInt(value),
  Number: (value: string) => Number(value),
  URLTrim: (value?: string) => value?.trim(),
  AmountNumber: (value: AmountValue) => {
    if (typeof value === "object" && "currency" in value) {
      return {
        ...value,

        amount: value.amount !== undefined ? Number(value.amount) : null,
        currency: value.currency !== "" ? value.currency : null,
      };
    }
    return Number(value);
  },

  AmountBigInt: (value: AmountValue) => {
    if (typeof value === "object" && "currency" in value) {
      return {
        ...value,

        amount: value.amount !== undefined ? BigInt(value.amount) : null,
        currency: value.currency !== "" ? value.currency : null,
      };
    }
  },
};

export function castValue(value: any, cast: ValueCast): any {
  return castFunctions[cast](value);
}
