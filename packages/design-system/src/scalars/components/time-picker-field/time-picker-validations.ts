import { TimePickerFieldProps } from "./time-picker-field";
import { isFormatTimeAllowed } from "./utils";

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
      return `Invalid time format.Plese select a valid format`;
    }

    return true;
  };
