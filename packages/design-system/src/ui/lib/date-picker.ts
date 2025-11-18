import { isValid } from "date-fns";
import type { DateFieldValue } from "./types.js";

export const splitIso8601DateTime = (isoString: string) => {
  const [datePart, timePart] = isoString.split("T");

  return {
    date: datePart,
    time: timePart,
  };
};

const splitDateTime = (
  value: DateFieldValue,
): { date: string; time: string } => {
  const defaultResult = { date: "", time: "" };

  if (!value) {
    return defaultResult;
  }

  if (typeof value === "string") {
    const { date, time } = splitIso8601DateTime(value);

    return { date, time };
  }

  if (isValid(value)) {
    const dateString = value.toISOString();
    const { date, time } = splitIso8601DateTime(dateString);
    return { date, time };
  }

  return defaultResult;
};

export const getDateFromValue = (value: DateFieldValue): string => {
  const { date } = splitDateTime(value);
  return date;
};
