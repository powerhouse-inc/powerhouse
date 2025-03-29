import { format, isValid, parse } from "date-fns";
import {
  ALLOWED_FORMATS,
  dateFormatRegexes,
} from "../date-time-picker/utils.js";
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

export const getTimeFromValue = (value: DateFieldValue): string => {
  const { time } = splitDateTime(value);
  return time;
};

export const formatDateToValue = (inputDate: Date): string => {
  // Add the time and the timezone to the date to split it later by T
  const stringDate = inputDate.toISOString();
  return stringDate;
};

/**
 * Convert a date string to an ISO date string (YYYY-MM-DD format)
 * @param inputString - The date string to convert
 * @param dateFormat - The date format to use
 * @returns The ISO date string
 * @example
 * // MM/dd/yyyy format
 * convertToISODateFormat('12/25/2023') // returns '2023-12-25'
 *
 * // dd/MM/yyyy format
 * convertToISODateFormat('25/12/2023') // returns '2023-12-25'
 *
 * // dd-MMM-yyyy format
 * convertToISODateFormat('25-Dec-2023') // returns '2023-12-25'
 *
 * // Invalid date
 * convertToISODateFormat('invalid') // returns 'invalid'
 */
export const convertToISODateFormat = (
  inputString: string,
  dateFormat = ALLOWED_FORMATS[0],
): string => {
  if (!dateFormat || !inputString) return inputString;

  for (const [formatStr, regex] of Object.entries(dateFormatRegexes)) {
    if (regex.test(inputString)) {
      const parsedDate = parse(inputString, formatStr, new Date());
      if (isValid(parsedDate)) {
        // Format to ISO without time
        const isoDate = format(parsedDate, "yyyy-MM-dd");
        return isoDate;
      }
    }
  }
  return inputString;
};

/**
 * Convert a date string to an ISO date string (YYYY-MM-DD format)
 * @param inputString - The date string to convert
 * @returns The ISO date string
 */
export const formatDateToValidCalendarDateFormat = (
  inputString: string,
): string => {
  const [datePart, timePart = "00:00-00:00"] = inputString.split("T");
  const parsedDate = convertToISODateFormat(datePart);

  // Combinar con la parte del tiempo y convertir a ISO
  const isoDate = new Date(`${parsedDate}T${timePart}`);
  return isoDate.toISOString();
};

/**
 * Formats a UTC Date object into an ISO 8601 string (yyyy-MM-dd)
 * @param date - Date object in UTC time
 * @returns Formatted date string in ISO 8601 format
 * @example
 * formatUTCDateToISOString(new Date('2023-03-05T00:00:00Z')) // returns '2023-03-05'
 * formatUTCDateToISOString(new Date('2023-12-01T00:00:00Z')) // returns '2023-12-01'
 */
export const formatUTCDateToISOStringWithOutTime = (date: Date): string => {
  return `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
};

/**
 * Swaps the day and month in a date string
 * @param utcDate - The date to swap the day and month in
 * @param separator - The separator to use between the day, month, and year
 * @returns The date string with the day and month swapped
 */
export function swapAmbiguousDayMonthFormat(utcDate: Date, separator: string) {
  return `${utcDate.getUTCDate().toString().padStart(2, "0")}${separator}${(utcDate.getUTCMonth() + 1).toString().padStart(2, "0")}${separator}${utcDate.getUTCFullYear()}`;
}
