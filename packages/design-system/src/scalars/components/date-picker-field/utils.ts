import { format, isValid, parse } from "date-fns";
import { DateFieldValue } from "./types";

export const ALLOWED_FORMATS = [
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "dd-MMM-yyyy",
  "MMM-dd-yyyy",
];

export const isFormatAllowed = (dateString: string) =>
  Object.values(dateFormatRegexes).some((regex) => regex.test(dateString));

export const isDateFormatAllowed = (
  dateString: string,
  dateFormat?: string,
) => {
  if (!dateFormat) return isFormatAllowed(dateString);
  const regex = dateFormatRegexes[dateFormat as keyof typeof dateFormatRegexes];
  if (!regex) return false;
  return regex.test(dateString);
};

export const dateFormatRegexes = {
  "yyyy-MM-dd": /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  "dd/MM/yyyy": /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/,
  "MM/dd/yyyy": /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/,
  "dd-MMM-yyyy":
    /^(0[1-9]|[12]\d|3[01])-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$/,
  "MMM-dd-yyyy":
    /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(0[1-9]|[12]\d|3[01])-\d{4}$/,
};

const splitDateTime = (
  value: DateFieldValue,
): { date: string; time: string } => {
  const defaultResult = { date: "", time: "" };

  if (!value) {
    return defaultResult;
  }

  if (typeof value === "string") {
    const [date, time] = value.split("T");
    return { date, time };
  }

  if (isValid(value)) {
    const dateString = value.toISOString();
    const [date, time] = dateString.split("T");
    return { date, time };
  }

  return defaultResult;
};

export const getDateFromValue = (value: DateFieldValue): string => {
  const { date } = splitDateTime(value);
  return date;
};

export const parseInputString = (
  inputString: string,
  dateFormat = ALLOWED_FORMATS[0],
): string => {
  if (!dateFormat || !inputString) return inputString;

  for (const [formatStr, regex] of Object.entries(dateFormatRegexes)) {
    if (regex.test(inputString)) {
      const parsedDate = parse(inputString, formatStr, new Date());
      if (isValid(parsedDate)) {
        const newValue = format(parsedDate, dateFormat || formatStr);
        return newValue;
      }
    }
  }
  return inputString;
};

export const formatDateToValue = (inputString: string): string => {
  // Add the time and the timezone to the date to split it later by T
  const stringDate = `${inputString}T00:00-00:00`;
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
  // Si la fecha tiene formato MM/dd/yyyy
  if (dateFormatRegexes["MM/dd/yyyy"].test(inputString)) {
    const [month, day, year] = inputString.split("/");
    // Construimos la fecha ISO en el orden correcto: año-mes-día
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  for (const [formatStr, regex] of Object.entries(dateFormatRegexes)) {
    if (regex.test(inputString)) {
      const parsedDate = parse(inputString, formatStr, new Date());
      if (isValid(parsedDate)) {
        // Formatear a ISO sin tiempo
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
