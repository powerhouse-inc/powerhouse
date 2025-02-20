import { TimePeriod } from "./type";

export const createChangeEvent = (
  value: string,
): React.ChangeEvent<HTMLInputElement> => {
  const nativeEvent = new Event("change", {
    bubbles: true,
    cancelable: true,
  });

  Object.defineProperty(nativeEvent, "target", {
    value: { value },
    writable: false,
  });

  return nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>;
};

export const ALLOWED_TIME_FORMATS = ["hh:mm a", "HH:mm", "hh:mm A"];
export const isFormatTimeAllowed = (format: string): boolean => {
  return ALLOWED_TIME_FORMATS.includes(format);
};
export const TIME_PATTERNS = {
  /** Matches times in 24-hour format (HH:mm) like: 0:00, 09:30, 23:59 */
  HOURS_24: /^([0-9]|0[0-9]|1[0-9]|2[0-3]):([0-5][0-9])$/,
  /** Matches times in 12-hour format (h:mm a) like: 1:00 AM, 12:59 PM */
  HOURS_12: /^(0?[1-9]|1[0-2]):([0-5][0-9])\s(AM|PM|am|pm)$/,
} as const;

export const cleanTime = (time: string) => {
  return time.replace(/\s*(AM|PM)\s*/i, "");
};
/**
 * Convert a 24-hour format time to a 12-hour format time
 * @param input - The time in 24-hour format like 14:35
 * @returns The time in 12-hour format like 2:35 PM
 */
export const convert24hTo12h = (input: string) => {
  const [hours, minutes] = input.split(":");
  const hourNum = parseInt(hours, 10);
  const period = hourNum >= 12 ? "PM" : "AM";
  const hour12 = hourNum % 12 || 12; // Convierte 0 a 12
  return `${hour12}:${minutes} ${period}`;
};

/**
 * Get the time from the input value in ISO 8601 format
 * @param value - The input value in ISO 8601 format like 2024-01-01T14:35:00.000Z
 * @returns The time in 24-hour format like 14:35
 */
export const getTime = (value: string) => {
  const [time] = value.split("±");
  // Extract only HH:mm from the complete format HH:mm:ss.SSS
  return time.substring(0, 5);
};

/**
 * Round the minute to the nearest interval
 * @param minute - The minute to round
 * @param interval - The interval to round to
 * @returns The rounded minute
 */
export const roundMinute = (minute: number, interval: number): number => {
  const remainder = minute % interval;
  let roundedMinute: number;
  if (remainder >= interval / 2) {
    roundedMinute = minute + (interval - remainder);
    if (roundedMinute >= 60) {
      // If it exceeds 60, round down
      roundedMinute = minute - remainder;
    }
  } else {
    roundedMinute = minute - remainder;
  }
  return roundedMinute;
};

/**
 * Transform the input time to the correct format
 * @param input - The input time
 * @param is12HourFormat - Whether the time is in 12-hour format
 * @param interval - The interval to round to
 * @returns The transformed time example string like 08:00 AM or 14:00
 */
export const transformInputTime = (
  input: string,
  is12HourFormat: boolean,
  interval = 1,
): { hour: string; minute: string; period?: TimePeriod } => {
  input = input.trim();
  let hourStr = "";
  let minuteStr = "";
  let period: TimePeriod | undefined = undefined;
  if (input.includes(":")) {
    const [hourPart, rest] = input.split(":", 2);
    hourStr = hourPart;
    const parts = rest.split(/\s+/);
    minuteStr = parts[0];
    if (parts.length > 1) {
      period = parts[1].toUpperCase() as TimePeriod;
    }
  } else {
    // Handle short hours: 8 -> 08:00, 12 -> 12:00
    const digits = input.padStart(4, "0");
    hourStr = digits.slice(0, 2);
    minuteStr = digits.slice(2, 4);
  }

  let hourNum = parseInt(hourStr, 10);
  let minuteNum = parseInt(minuteStr, 10) || 0;
  if (isNaN(hourNum)) hourNum = 0;
  if (isNaN(minuteNum)) minuteNum = 0;

  // Apply the minute rounding using the interval
  minuteNum = roundMinute(minuteNum, interval);
  if (is12HourFormat) {
    // First convert 24h to 12h format if needed
    if (hourNum > 12) {
      hourNum -= 12;
    } else if (hourNum === 0) {
      hourNum = 12;
    }

    // If still no period assigned, determine based on hour
    if (!period) {
      period = hourNum >= 8 && hourNum <= 11 ? "AM" : "PM";
    }
  } else {
    // Convert any AM/PM designator to 24h
    if (period === "PM" && hourNum < 12) {
      hourNum += 12;
    } else if (period === "AM" && hourNum === 12) {
      hourNum = 0;
    }
    // Force period to undefined in 24h format
    period = undefined;
  }

  return {
    hour: String(hourNum).padStart(2, "0"),
    minute: String(minuteNum).padStart(2, "0"),
    period: is12HourFormat ? period : undefined,
  };
};

/**
 * Validate the input time
 * @param input - The input time string. Valid formats include:
 *   - 12-hour format with AM/PM: "2:34 AM", "11:45 PM"
 *   - 24-hour format: "15:23", "08:00"
 *   - Short numeric format: "345" (transforms to "3:45"), "1430" (transforms to "14:30")
 * @returns Whether the input time is valid and can be transformed into a proper time format
 */
export const isValidTimeInput = (input: string): boolean => {
  input = input.trim();
  // Allow change the format and convert the time
  if (input.includes(":")) {
    return (
      TIME_PATTERNS.HOURS_12.test(input) || TIME_PATTERNS.HOURS_24.test(input)
    );
  } else {
    // "For digits, expect 3 or 4 characters and validate they're in range".
    if (input.length !== 3 && input.length !== 4) {
      return false;
    }
    const hourStr = input.length === 3 ? input.slice(0, 1) : input.slice(0, 2);
    const minuteStr = input.slice(-2);
    const hourNum = parseInt(hourStr, 10);
    const minuteNum = parseInt(minuteStr, 10);
    return hourNum >= 0 && hourNum <= 23 && minuteNum >= 0 && minuteNum <= 59;
  }
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
 * Get the formatted offset of the time zone for display purposes
 * @param timeZone - The time zone (e.g., "America/New_York", "Europe/London")
 * @returns The offset prefixed with "UTC" (e.g., "UTC+05:30", "UTC-04:00")
 * @example
 * getOffsetToDisplay("America/New_York") // Returns "UTC-04:00" or "UTC-05:00"
 * getOffsetToDisplay("Asia/Kolkata")     // Returns "UTC+05:30"
 * getOffsetToDisplay()                   // Returns "UTC±00:00"
 */
export const getOffsetToDisplay = (timeZone?: string) => {
  return `UTC${getOffset(timeZone)}`;
};

/**
 * Get a list of all available timezone options formatted for display
 * @returns An array of timezone options with formatted labels
 * @example
 * // Returns array of objects like:
 * [
 *   { value: "America/New_York", label: "(UTC-04:00) America/New York" },
 *   { value: "Europe/London", label: "(UTC+01:00) Europe/London" },
 *   { value: "Asia/Tokyo", label: "(UTC+09:00) Asia/Tokyo" }
 * ]
 */
export const getOptions = () => {
  const timeZones = Intl.supportedValuesOf("timeZone");
  return timeZones.map((timeZone) => {
    const offset = getOffsetToDisplay(timeZone);
    const label = `(${offset}) ${timeZone.replace(/_/g, " ")}`;
    return { value: timeZone, label };
  });
};

/**
 * Split the datetime into hours, minutes, and last part (offset)
 * @param datetime - The datetime string
 * @returns An object containing hours, minutes, and last part (offset)
 */
export const splitDatetime = (datetime?: string) => {
  if (!datetime) return { hours: "", minutes: "", timezoneOffset: "" };
  const offsetMatch = /([+-]\d{2}:\d{2})$/.exec(datetime);
  const timezoneOffset = offsetMatch ? offsetMatch[0] : "";

  const time = removeDate(datetime);
  const [hours, minutes] = time.split(":");

  return {
    hours: hours.padStart(2, "0"),
    minutes: minutes.padStart(2, "0"),
    timezoneOffset,
  };
};

/**
 * Get the hours from the datetime
 * @param datetime - The datetime string
 * @returns The hours
 */
export const getHours = (datetime?: string) => {
  const { hours } = splitDatetime(datetime);
  return hours;
};

/**
 * Get the minutes from the datetime
 * @param datetime - The datetime string
 * @returns The minutes
 */
export const getMinutes = (datetime?: string) => {
  const { minutes } = splitDatetime(datetime);
  return minutes;
};

export const getInputValue = (datetime?: string) => {
  const { hours, minutes } = splitDatetime(datetime);
  if (!hours && !minutes) return "";
  return `${hours}:${minutes}`;
};

/**
 * Removes the date portion from an ISO 8601 datetime string, keeping only the time
 * @param datetime - The datetime string (e.g., "2024-03-21T14:30:00" or "14:30:00")
 * @returns The time portion of the string (e.g., "14:30:00")
 * @example
 * removeDate("2024-03-21T14:30:00") // Returns "14:30:00"
 * removeDate("14:30:00")            // Returns "14:30:00"
 */
export const removeDate = (datetime: string) => {
  if (!datetime.includes("T")) return datetime;
  return datetime.replace(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/, "$2");
};

/**
 * Get the timezone from the utcOffset
 * @param utcOffset - The utcOffset string
 * @returns The timezone
 */
export const getTimezone = (utcOffset: string): string => {
  if (!utcOffset) return "";
  const options = getOptions();
  const { timezoneOffset } = splitDatetime(utcOffset);
  const findedOption = options.find((option) => {
    return option.label.includes(timezoneOffset);
  });
  return findedOption?.value ?? "";
};

/**
 * Formats time components into an ISO-like datetime string with milliseconds and timezone offset
 * @param hours - The hours component (e.g., "14" or "02")
 * @param minutes - The minutes component, may include AM/PM (e.g., "30" or "30 PM")
 * @param timezoneOffset - The timezone offset (e.g., "+05:30" or "-04:00")
 * @returns Formatted datetime string (e.g., "14:30:00.000+05:30")
 * @example
 * formatInputsToValueFormat("14", "30", "+05:30")     // Returns "14:30:00.000+05:30"
 * formatInputsToValueFormat("02", "30 PM", "-04:00")  // Returns "02:30:00.000-04:00"
 */
export const formatInputsToValueFormat = (
  hours: string,
  minutes: string,
  timezoneOffset: string,
): string => {
  const datetime = `${cleanTime(hours)}:${cleanTime(minutes)}:00.000${timezoneOffset}`;
  return datetime;
};

/**
 * Convert a 12-hour format time to a 24-hour format time
 * @param input - The time in 12-hour format like 2:35 PM
 * @returns The time in 24-hour format like 14:35
 */
export const convert12hTo24h = (input: string) => {
  // convert from 12 format to 24 format
  const [hours, minutes] = input.split(":");
  const period =
    input.includes("AM") || input.includes("PM") ? input.slice(-2) : undefined;
  let formattedHours = hours;
  if (period === "PM" && hours !== "12") {
    formattedHours = (parseInt(hours, 10) + 12).toString();
  } else if (period === "AM" && hours === "12") {
    formattedHours = "00";
  }
  return `${formattedHours}:${minutes}`;
};

/**
 * Formats a time input string into a standardized display format
 * @param input - The input time string. Can be in various formats:
 *   - 24-hour format (e.g., "14:30", "08:00")
 *   - 12-hour format (e.g., "2:30 PM", "8:00 AM")
 *   - Short format (e.g., "1430", "0800")
 * @param is12HourFormat - If true, outputs in 12-hour format with AM/PM
 *                        If false, outputs in 24-hour format
 * @param dateIntervals - Optional interval in minutes to round the time to
 *                       (e.g., 15 would round to nearest quarter hour)
 * @returns Formatted time string
 *   - 12-hour format: "hh:mm AM/PM" (e.g., "02:30 PM")
 *   - 24-hour format: "HH:mm" (e.g., "14:30")
 */
export const formatInputToDisplayValid = (
  input: string,
  is12HourFormat: boolean,
  dateIntervals?: number,
) => {
  const { hour, minute, period } = transformInputTime(
    input,
    is12HourFormat,
    dateIntervals,
  );
  return is12HourFormat ? `${hour}:${minute} ${period}` : `${hour}:${minute}`;
};

/**
 * Extracts the hours and minutes from the input time string.
 *
 * This function takes a time string as input and returns an object containing the hours and minutes.
 * It supports various input formats, including 24-hour format (e.g., "14:30"), 12-hour format (e.g., "2:30 PM"), and short format (e.g., "1430").
 *
 * @param input - The input time string.
 * @returns An object with two properties: `hours` and `minutes`, representing the extracted hours and minutes from the input string.
 *
 * Examples:
 * - `getHoursAndMinutes("14:30")` returns `{ hours: "14", minutes: "30" }`.
 * - `getHoursAndMinutes("2:30 PM")` returns `{ hours: "2", minutes: "30", period: "PM" }`.
 * - `getHoursAndMinutes("1430")` returns `{ hours: "14", minutes: "30" }`.
 */
export const getHoursAndMinutes = (input: string) => {
  const [hours, minutes] = input.split(":");
  const period =
    input.includes("AM") || input.includes("PM") ? input.slice(-2) : undefined;
  return { hours, minutes, period };
};

export const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  // Allow control keys (backspace, delete, arrows, etc)
  if (
    e.key === "Backspace" ||
    e.key === "Delete" ||
    e.key === "ArrowLeft" ||
    e.key === "ArrowRight" ||
    e.key === "Tab" ||
    e.key === "Enter" ||
    e.key === " " ||
    e.key === "Space" ||
    e.ctrlKey ||
    e.metaKey
  ) {
    return;
  }

  // Allow numbers
  if (/^[0-9]$/.test(e.key)) {
    return;
  }
  // Allow ":"
  if (e.key === ":") {
    return;
  }
  // Allow "A", "M", "P" for AM/PM
  if (/^[AMP]$/i.test(e.key)) {
    return;
  }

  e.preventDefault();
};
