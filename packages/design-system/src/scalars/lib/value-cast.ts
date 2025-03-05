import { parse, format } from "date-fns";
import { AmountValue } from "../components/amount-field/types";
import { getDateFromValue } from "../components/date-picker-field/utils";
import {
  getDateFormat,
  normalizeMonthFormat,
  parseInputString,
} from "../components/date-time-field/utils";

export type ValueCast =
  | "BigInt"
  | "Number"
  | "URLTrim"
  | "AmountNumber"
  | "AmountBigInt"
  | "DateString"
  | "DateTimeString";

export const castFunctions: Record<
  ValueCast,
  (value: any, castParams?: string) => any
> = {
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
  DateString: (value: string, dateFormat = "yyyy-MM-dd") => {
    const momentDate = getDateFromValue(value);
    const date = normalizeMonthFormat(momentDate);

    const correctFormat = getDateFormat(dateFormat);
    const newValue = parseInputString(date, correctFormat);

    const fechaUTC = parse(newValue, correctFormat ?? "yyyy-MM-dd", new Date());
    return fechaUTC;
  },
  DateTimeString: (value: string, dateFormat = "yyyy-MM-dd") => {
    const [datePart, timePart] = value.split("T");

    const unFormattedDate = getDateFromValue(datePart);
    const date = normalizeMonthFormat(unFormattedDate);
    const correctFormat = getDateFormat(dateFormat);

    const normalizedDate = parseInputString(date, correctFormat);

    const parsedDate = parse(normalizedDate, correctFormat ?? "", new Date());
    const isoDate = format(parsedDate, "yyyy-MM-dd");
    return `${isoDate}T${timePart}`;
  },
};

export function castValue(value: any, cast: string): any {
  const [castType, ...params] = cast.split(":");
  return castFunctions[castType as ValueCast](value, ...params);
}
