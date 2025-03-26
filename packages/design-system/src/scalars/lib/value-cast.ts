import { format, parse } from "date-fns";
import { type AmountValue } from "../../ui/components/data-entry/amount-input/types.js";
import { getDateFromValue } from "../../ui/components/data-entry/date-picker/utils.js";
import {
  getDateFormat,
  normalizeMonthFormat,
  parseInputString,
} from "../../ui/components/data-entry/date-time-picker/utils.js";

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
    if (typeof value === "object" && "unit" in value) {
      return {
        ...value,

        amount: value.amount !== undefined ? Number(value.amount) : null,
        unit: value.unit !== "" ? value.unit : null,
      };
    }
    if (typeof value === "object") {
      return {
        ...value,

        amount: Number(value.amount),
      };
    }
    return Number(value);
  },

  AmountBigInt: (value: AmountValue) => {
    if (typeof value === "object" && "unit" in value) {
      return {
        ...value,

        amount: value.amount !== undefined ? BigInt(value.amount) : null,
        unit: value.unit !== "" ? value.unit : null,
      };
    }
  },
  DateString: (value: string, dateFormat = "yyyy-MM-dd") => {
    const momentDate = getDateFromValue(value);
    const date = normalizeMonthFormat(momentDate);
    const correctFormat = getDateFormat(dateFormat);
    const newValue = parseInputString(date, correctFormat);

    const fechaUTC = parse(newValue, correctFormat ?? "yyyy-MM-dd", new Date());

    const isoDate = format(fechaUTC, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
    return isoDate;
  },
  DateTimeString: (value: string, dateFormat = "yyyy-MM-dd") => {
    const [datePart, timePart] = value.split("T");

    const unFormattedDate = getDateFromValue(datePart);
    const date = normalizeMonthFormat(unFormattedDate);
    const correctFormat = getDateFormat(dateFormat);

    const normalizedDate = parseInputString(date, correctFormat);
    const parsedDate = parse(
      normalizedDate,
      correctFormat ?? "yyyy-MM-dd",
      new Date(),
    );

    const isoDate = format(parsedDate, "yyyy-MM-dd");

    return `${isoDate}T${timePart}`;
  },
};

export function castValue(value: any, cast: string): any {
  const [castType, ...params] = cast.split(":");
  return castFunctions[castType as ValueCast](value, ...params);
}
