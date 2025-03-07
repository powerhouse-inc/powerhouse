import {
  getDateFromValue,
  splitIso8601DateTime,
} from "../date-picker-field/utils";
import { DatePickerFieldProps } from "../date-picker-field/date-picker-field";
import {
  getDateFormat,
  isDateFormatAllowed,
  isValidTime,
  normalizeMonthFormat,
} from "./utils";
import { DateFieldValue } from "../date-picker-field/types";

export const dateTimeFieldValidations =
  ({ dateFormat }: DatePickerFieldProps) =>
  (value: unknown) => {
    if (value === "" || value === undefined) {
      return true;
    }

    // 1. Validate that it has date and time separated by space
    const { date, time } = splitIso8601DateTime(value as string);

    if (!date || !time) {
      return "Invalid format. Use DATE and TIME separated by a space.";
    }

    const internalFormat = getDateFormat(dateFormat ?? "");
    const stringDate = normalizeMonthFormat(
      getDateFromValue(value as DateFieldValue),
    );

    const isValid = isDateFormatAllowed(stringDate, internalFormat);

    if (!isValid) {
      return "Invalid date format.";
    }

    if (!isValidTime(time)) {
      return "Invalid time format. Use HH:mm.";
    }

    return true;
  };
