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
    // Validar formato 24-hour (HH:mm)
    if (timeFormat === "HH:mm") {
      if (!TIME_PATTERNS.HOURS_24.test(value as string)) {
        return "Please enter a valid time in 24-hour format";
      }
      // Additional validation for real hours/minutes
      const [hours, minutes] = (value as string).split(":").map(Number);
      if (hours > 23 || hours < 0 || minutes > 59 || minutes < 0) {
        return "Please enter a valid time in 24-hour format";
      }
    }

    // Validar formato 12-hour (hh:mm a)
    if (timeFormat === "hh:mm a") {
      if (!TIME_PATTERNS.HOURS_12.test(value as string)) {
        return "Please enter a valid time in 12-hour";
      }
      // Additional validation for real hours/minutes
      const [timePart] = (value as string).split(" ");
      const [hours, minutes] = timePart.split(":").map(Number);
      if (hours > 12 || hours < 1 || minutes > 59 || minutes < 0) {
        return "Please enter a valid time in 12-hour";
      }
    }
    return true;
  };
