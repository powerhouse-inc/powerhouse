import { TimePickerFieldProps } from "./time-picker-field";
import { isFormatTimeAllowed, timeRegex12Hour, timeRegex24Hour } from "./utils";

export const validateTimePicker =
  ({ timeFormat }: TimePickerFieldProps) =>
  (value: unknown) => {
    if (value === "") {
      return true;
    }
    if (value === undefined) {
      return true;
    }

    if (timeFormat && !isFormatTimeAllowed(timeFormat)) {
      return `Invalid time format. Please select a valid format`;
    }

    // For 24-hour format (HH:mm)
    if (timeFormat === "HH:mm") {
      if (!timeRegex24Hour.test(value as string)) {
        return "Invalid time. Please enter time in 24-hour format";
      }
    }

    // For 12-hour format (h:mm a)
    if (timeFormat === "h:mm a") {
      if (!timeRegex12Hour.test(value as string)) {
        return "Invalid time. Please enter time in 12-hour format with AM/PM";
      }
    }

    return true;
  };
