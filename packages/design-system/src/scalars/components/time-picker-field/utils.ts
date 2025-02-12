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

export const transformInputTime = (
  input: string,
  is12HourFormat: boolean,
  defaultPeriod?: TimePeriod,
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

  if (is12HourFormat) {
    if (!period) {
      period = defaultPeriod || "AM";
      if (hourNum === 12) period = "PM";
    }

    // Convert 24h format to 12h
    if (hourNum > 12) {
      period = "AM";
      hourNum -= 12;
    }

    // Special case: 0 -> 12 AM
    if (hourNum === 0) {
      hourNum = 12;
    }

    // Special rule: 12 without period -> PM
    period = hourNum >= 8 && hourNum <= 11 ? "AM" : "PM";
  } else {
    {
      // Convert any AM/PM designator to 24h
      if (period === "PM" && hourNum < 12) {
        hourNum += 12;
      } else if (period === "AM" && hourNum === 12) {
        hourNum = 0;
      }
      // Force period to undefined in 24h format
      period = undefined;
    }
  }

  return {
    hour: String(hourNum).padStart(2, "0"),
    minute: String(minuteNum).padStart(2, "0"),
    period: is12HourFormat ? period : undefined,
  };
};

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
