import { DatePickerFieldProps } from "./date-picker-field";
import { getDateFromValue } from "./utils";
import { DateFieldValue } from "./types";
import {
  getDateFormat,
  isDateFormatAllowed,
  normalizeMonthFormat,
} from "../date-time-field/utils";

export const validateDatePicker =
  ({ dateFormat }: DatePickerFieldProps) =>
  (value: unknown) => {
    if (value === "" || value === undefined) {
      return true;
    }

    const internalFormat = getDateFormat(dateFormat ?? "");
    const stringDate = normalizeMonthFormat(
      getDateFromValue(value as DateFieldValue),
    );

    const isValid = isDateFormatAllowed(stringDate, internalFormat);

    if (!isValid) {
      return `Invalid date format. Please use a valid format`;
    }
    return true;
  };
