import { format, isValid, parse } from "date-fns";

export const ALLOWED_FORMATS = [
  "yyyy-MM-dd",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "dd-MMM-yyyy",
  "MMM-dd-yyyy",
];

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

export const getDateFormat = (displayFormat: string): string | undefined => {
  switch (displayFormat) {
    case "YYYY-MM-DD":
      return "yyyy-MM-dd";
    case "DD/MM/YYYY":
      return "dd/MM/yyyy";
    case "MM/DD/YYYY":
      return "MM/dd/yyyy";
    case "DD-MMM-YYYY":
      return "dd-MMM-yyyy";
    case "MMM-DD-YYYY":
      return "MMM-dd-yyyy";
    default:
      return undefined;
  }
};

export const normalizeMonthFormat = (dateString: string): string => {
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];

  return dateString.replace(
    /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i,
    (month) => {
      const upperMonth = month.toUpperCase();
      const monthIndex = months.indexOf(upperMonth);
      if (monthIndex !== -1) {
        return (
          months[monthIndex].charAt(0) +
          months[monthIndex].slice(1).toLowerCase()
        );
      }
      return month;
    },
  );
};
