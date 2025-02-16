import { AmountValue } from "../components/amount-field/types";
import { parseInputString } from "../components/date-picker-field/utils";
import { getDateFromValue } from "../components/date-picker-field/utils";

export type ValueCast =
  | "BigInt"
  | "Number"
  | "URLTrim"
  | "AmountNumber"
  | "AmountBigInt"
  | "DateString";

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
  DateString: (value: string) => {
    const date = getDateFromValue(value);
    const newValue = parseInputString(date, "yyyy-MM-dd");
    return new Date(newValue).toISOString();
  },
};

export function castValue(value: any, cast: ValueCast): any {
  return castFunctions[cast](value);
}
