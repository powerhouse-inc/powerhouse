import { TimePickerFieldProps } from "./time-picker-field";
import { isFormatTimeAllowed, TIME_PATTERNS } from "./utils";

export const validateTimePicker =
  ({ timeFormat }: TimePickerFieldProps) =>
  (value: unknown) => {
    if (value === "") {
      return true;
    }
    if (value === undefined) {
      return true;
    }

    if (!timeFormat) {
      const is24HourValid = TIME_PATTERNS.HOURS_24.test(value as string);
      const is12HourValid = TIME_PATTERNS.HOURS_12.test(value as string);
      if (!is24HourValid && !is12HourValid) {
        return "Invalid time. Please enter time a valid format";
      }
    }
    if (timeFormat && !isFormatTimeAllowed(timeFormat)) {
      return `Invalid time format. Please select a valid format`;
    }

    // For 24-hour format (HH:mm)
    if (timeFormat === "HH:mm") {
      if (!TIME_PATTERNS.HOURS_24.test(value as string)) {
        return "Please enter time in 24-hour format";
      }
    }

    // For 12-hour format (h:mm a)
    if (timeFormat === "hh:mm a") {
      if (!TIME_PATTERNS.HOURS_12.test(value as string)) {
        return "Please enter time in 12-hour format with AM/PM";
      }
    }

    return true;
  };
