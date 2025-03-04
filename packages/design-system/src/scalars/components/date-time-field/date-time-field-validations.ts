import { format } from "date-fns";
import {
  formatDateToValidCalendarDateFormat,
  splitIso8601DateTime,
} from "../date-picker-field/utils";
import { DatePickerFieldProps } from "../date-picker-field/date-picker-field";
import { isDateFormatAllowed, isValidTime } from "./utils";

export const dateTimeFieldValidations =
  ({ minDate, maxDate, dateFormat }: DatePickerFieldProps) =>
  (value: unknown) => {
    if (value === "" || value === undefined) {
      return true;
    }

    // 1. Validate that it has date and time separated by space
    const { date, time } = splitIso8601DateTime(value as string);

    if (!date || !time) {
      return "Invalid format. Use DATE TIME separated by space";
    }

    const isValid = isDateFormatAllowed(date, dateFormat);

    if (!isValid) {
      return "Invalid date format";
    }

    if (!isValidTime(time)) {
      return "Invalid time format. Use HH:mm";
    }

    const isoDate = formatDateToValidCalendarDateFormat(date);
    const validDate = new Date(isoDate);
    if (minDate) {
      const minDateValue = new Date(minDate);
      if (validDate < minDateValue) {
        const formattedMinDate = format(minDateValue, "dd/MM/yyyy");
        return `Date must be on or after ${formattedMinDate}`;
      }
    }

    if (maxDate) {
      const maxDateValue = new Date(maxDate);
      if (validDate > maxDateValue) {
        const formattedMaxDate = format(maxDateValue, "dd/MM/yyyy");
        return `Date must be on or before ${formattedMaxDate}`;
      }
    }

    return true;
  };
