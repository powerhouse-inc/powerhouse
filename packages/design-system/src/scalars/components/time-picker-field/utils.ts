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

export const getTime = (value: string) => {
  const [time] = value.split("±");
  // Extract only HH:mm from the complete format HH:mm:ss.SSS
  return time.substring(0, 5);
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
  interval = 1,
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

  // Apply the minute rounding using the interval
  minuteNum = roundMinute(minuteNum, interval);

  if (is12HourFormat) {
    if (!period) {
      period = hourNum >= 8 && hourNum <= 11 ? "AM" : "PM";
      if (hourNum === 12) period = "PM";
    }

    // Convert 24h format to 12h
    if (hourNum > 12 && !period) {
      // period = "AM";
      hourNum -= 12;
    }

    // Special case: 0 -> 12 AM
    if (hourNum === 0) {
      hourNum = 12;
    }

    // Special rule: 12 without period -> PM
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

export const getOffset = (timeZone?: string) => {
  try {
    const date = new Date();
    // Format the date in the specified time zone and extract the offset
    const format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      timeZoneName: "shortOffset",
    });
    const parts = format.formatToParts(date);
    const offsetPart = parts.find(
      (part) => part.type === "timeZoneName",
    )?.value;

    if (!offsetPart) return "±00:00";

    // Convertir GMT±HH a UTC±HH:MM
    const offsetMatch = /GMT([+-]\d+)(?::(\d+))?/.exec(offsetPart);
    if (!offsetMatch) return "±00:00";
    const offsetStr = offsetMatch[1];
    const sign = offsetStr[0];
    const num = offsetStr.slice(1);
    // Add the zero after the sign when necessary
    const hours = `${sign}${num.padStart(2, "0")}`;
    const minutes = offsetMatch[2] ? offsetMatch[2].padStart(2, "0") : "00";
    return `${hours}:${minutes}`;
  } catch (error) {
    return "±00:00";
  }
};

export const getOffsetToDisplay = (timeZone?: string) => {
  return `UTC${getOffset(timeZone)}`;
};

export const getOptions = () => {
  const timeZones = Intl.supportedValuesOf("timeZone");
  return timeZones.map((timeZone) => {
    const offset = getOffsetToDisplay(timeZone);
    const label = `(${offset}) ${timeZone.replace(/_/g, " ")}`;
    return { value: timeZone, label };
  });
};

export const removeDate = (datetime: string) => {
  if (!datetime.includes("T")) return datetime;
  return datetime.replace(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/, "$2");
};

export const splitDatetime = (datetime?: string) => {
  if (!datetime) return { hours: "", minutes: "", lastPart: "" };
  const offsetMatch = /([+-]\d{2}:\d{2})$/.exec(datetime);
  const lastPart = offsetMatch ? offsetMatch[0] : "";

  const time = removeDate(datetime);
  const [hours, minutes] = time.split(":");

  return {
    hours: hours.padStart(2, "0"),
    minutes: minutes.padStart(2, "0"),
    lastPart,
  };
};

export const getHours = (datetime?: string) => {
  const { hours } = splitDatetime(datetime);
  return hours;
};

export const getMinutes = (datetime?: string) => {
  const { minutes } = splitDatetime(datetime);
  return minutes;
};

export const getLastPart = (datetime?: string) => {
  const { lastPart } = splitDatetime(datetime);
  return lastPart;
};

export const getInputValue = (datetime?: string) => {
  const { hours, minutes } = splitDatetime(datetime);
  if (!hours && !minutes) return "";
  return `${hours}:${minutes}`;
};

export const getTimezone = (utcOffset: string): string => {
  if (!utcOffset) return "";
  const options = getOptions();
  const { lastPart } = splitDatetime(utcOffset);
  const findedOption = options.find((option) => {
    return option.label.includes(lastPart);
  });
  return findedOption?.value ?? "";
};

export const cleanTime = (time: string) => {
  return time.replace(/\s*(AM|PM)\s*/i, "");
};

export const formatInputsToValueFormat = (
  hours: string,
  minutes: string,
  lastPart: string,
) => {
  const cleanMinutes = cleanTime(minutes);

  const cleanHours = cleanTime(hours);

  const datetime = `${cleanHours}:${cleanMinutes}:00.000${lastPart}`;
  return datetime;
};

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

export const formatInputToDisplayValid = (
  input: string,
  is12HourFormat: boolean,
  dateIntervals?: number,
  selectedPeriod?: TimePeriod,
) => {
  const { hour, minute, period } = transformInputTime(
    input,
    is12HourFormat,
    dateIntervals,
    selectedPeriod,
  );
  return is12HourFormat ? `${hour}:${minute} ${period}` : `${hour}:${minute}`;
};

export const getHoursAndMinutes = (input: string) => {
  const [hours, minutes] = input.split(":");
  const period =
    input.includes("AM") || input.includes("PM") ? input.slice(-2) : undefined;
  return { hours, minutes, period };
};

export const getInitialPeriod = (value: string, timeFormat: string) => {
  const is12HourFormat = timeFormat.includes("a");
  return is12HourFormat
    ? parseInt(getHours(value)) >= 12
      ? "PM"
      : "AM"
    : undefined;
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
