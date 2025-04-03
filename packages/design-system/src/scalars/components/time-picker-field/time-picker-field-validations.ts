import { type TimeFieldProps } from "#scalars";
import {
  convert24hTo12h,
  getHoursAndMinutesFromValue,
  getTime,
  isFormatTimeAllowed,
  isValidTimeFromValue,
  TIME_PATTERNS,
} from "../../../ui/components/data-entry/time-picker/utils.js";

export const validateTimePicker =
  ({ timeFormat }: TimeFieldProps) =>
  (value: unknown) => {
    if (value === "") {
      return true;
    }
    if (value === undefined) {
      return true;
    }
    const getHoursAndMinutes = getHoursAndMinutesFromValue(value as string);

    if (!isValidTimeFromValue(getHoursAndMinutes)) {
      return "Invalid time. Please enter time a valid format";
    }
    // Validate the format of the value
    const time = getTime((value as string).trim());
    if (!timeFormat) {
      const is24HourValid = TIME_PATTERNS.HOURS_24.test(time);
      const is12HourValid = TIME_PATTERNS.HOURS_12.test(time);
      if (!is24HourValid && !is12HourValid) {
        return "Invalid time. Please enter time a valid format";
      }
    }
    if (timeFormat && !isFormatTimeAllowed(timeFormat)) {
      return `Invalid time format. Please select a valid format`;
    }
    // Validar formato 24-hour (HH:mm)
    if (timeFormat === "HH:mm") {
      if (!TIME_PATTERNS.HOURS_24.test(time)) {
        return "Please enter a valid time in 24-hour format";
      }
      // Additional validation for real hours/minutes
      const [hours, minutes] = time.split(":").map(Number);
      if (hours > 23 || hours < 0 || minutes > 59 || minutes < 0) {
        return "Please enter a valid time in 24-hour format";
      }
    }

    // Validar formato 12-hour (hh:mm a)
    if (timeFormat === "hh:mm a" || timeFormat === "hh:mm A") {
      const parse12HorsFormat = convert24hTo12h(time);

      // Additional validation for real hours/minutes
      const [timePart] = parse12HorsFormat.split(" ");
      const [hours, minutes] = timePart.split(":").map(Number);
      if (hours > 12 || hours < 1 || minutes > 59 || minutes < 0) {
        return "Please enter a valid time in 12-hour format";
      }
    }
    return true;
  };
