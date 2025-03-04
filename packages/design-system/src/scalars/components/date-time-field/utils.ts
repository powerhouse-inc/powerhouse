import { format, isValid, parse } from "date-fns";
import { normalizeMonthFormat } from "../date-picker-field/utils";

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

/**
 * Split a date-time string into date and time components
 * @param dateTimeString - The date-time string to split
 * @returns An object containing the date and time components
 * @example
 * splitDateTimeStringFromInput("2024-01-01 12:00:00") // { date: "2024-01-01", time: "12:00:00" }
 */
export const splitDateTimeStringFromInput = (
  dateTimeString: string,
): { date: string; time: string } => {
  if (!dateTimeString.includes(" ")) {
    return { date: "", time: "" };
  }

  const [date = "", time = ""] = dateTimeString.split(" ");
  return { date, time };
};

/**
 * Check if a time string is valid
 * @param time - The time string to check
 * @returns True if the time string is valid, false otherwise
 * @example
 * isValidTime("12:00:00") // true
 */
export const isValidTime = (time: string) => {
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  const trimmedTime = time.split(":").slice(0, 2).join(":");
  return timeRegex.test(trimmedTime);
};

/**
 * Get the local system timezone offset in ±HH:MM format
 * @returns The local timezone offset (e.g., "+02:00", "-05:00")
 * @example
 * getLocalOffset() // Returns "+01:00" for GMT+1
 * getLocalOffset() // Returns "-05:00" for GMT-5
 */
export const getLocalOffset = (): string => {
  const localOffset = new Date().getTimezoneOffset();
  const sign = localOffset <= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(localOffset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(localOffset) % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
};

/**
 * Gets the current UTC offset for a specific time zone
 * @param timeZone - The IANA time zone name (e.g. "America/New_York", "Europe/London").
 *                   If not provided or invalid, falls back to local system timezone.
 * @returns The offset in ISO 8601 format (±HH:mm) based on current DST rules.
 * @example
 * getOffset("America/New_York") // Returns "-04:00" (EDT) or "-05:00" (EST)
 * getOffset("Asia/Kolkata")     // Returns "+05:30" (IST - no DST)
 * getOffset("Invalid/Zone")     // Returns local system offset (e.g. "-03:00")
 * getOffset()                   // Returns local system offset
 */
export const getOffset = (timeZone?: string) => {
  // Handle edge cases first
  if (!timeZone || typeof timeZone !== "string") return getLocalOffset();

  // Create a formatter in a safe way
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    timeZoneName: "shortOffset",
  });

  // Extract the offset from the format
  const offsetPart = formatter
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;

  if (!offsetPart) return getLocalOffset();

  // Handle multiple formats
  const offsetMatch =
    /^(?:GMT|UTC)?([+-])(\d{1,2})(?::?(\d{2}))?/i.exec(offsetPart) ||
    /(UTC|GMT)([+-]\d{2}:\d{2})/.exec(offsetPart);

  if (!offsetMatch) return getLocalOffset();
  const sign = offsetMatch[1] || "+";
  const hours = (offsetMatch[2] || "00").padStart(2, "0");
  const minutes = (offsetMatch[3] || "00").padStart(2, "0");

  return `${sign}${hours}:${minutes}`;
};

/**
 * Parse an input string to a valid date format
 * @param inputString - The input string to parse
 * @param dateFormat - The date format to use
 * @returns The parsed date string
 * @example
 * parseInputString("2024-01-01 12:00:00", "yyyy-MM-dd HH:mm:ss") // "2024-01-01 12:00:00"
 */
export const parseInputString = (
  inputString: string,
  dateFormat = ALLOWED_FORMATS[0],
): string => {
  const newInputString = normalizeMonthFormat(inputString);

  if (!dateFormat || !inputString) return inputString;

  // First check the specified format
  const specifiedFormatRegex =
    dateFormatRegexes[dateFormat as keyof typeof dateFormatRegexes];
  if (specifiedFormatRegex.test(newInputString)) {
    const parsedDate = parse(newInputString, dateFormat, new Date());
    if (isValid(parsedDate)) {
      return format(parsedDate, dateFormat);
    }
  }

  for (const [formatStr, regex] of Object.entries(dateFormatRegexes)) {
    if (regex.test(newInputString)) {
      const parsedDate = parse(newInputString, formatStr, new Date());
      if (isValid(parsedDate)) {
        const newValue = format(parsedDate, dateFormat || formatStr);
        return newValue;
      }
    }
  }
  return inputString;
};
