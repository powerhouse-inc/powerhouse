import { format } from "date-fns";
import { type DateFieldProps } from "../date-field/date-field.js";
import { type DateFieldValue } from "../date-field/types.js";
import {
  formatDateToValidCalendarDateFormat,
  getDateFromValue,
  splitIso8601DateTime,
} from "../date-field/utils.js";
import {
  getDateFormat,
  isDateFormatAllowed,
  isValidTime,
  normalizeMonthFormat,
} from "./utils.js";

export const dateTimeFieldValidations =
  ({ dateFormat, minDate, maxDate }: DateFieldProps) =>
  (value: unknown) => {
    if (value === "" || value === undefined) {
      return true;
    }
    const internalFormat = getDateFormat(dateFormat ?? "");

    // 1. Validate that it has date and time separated by space
    const { date, time } = splitIso8601DateTime(value as string);

    if (!date || !time) {
      return "Invalid format. Use DATE and TIME separated by a space.";
    }

    const stringDate = normalizeMonthFormat(
      getDateFromValue(value as DateFieldValue),
    );

    const isValid = isDateFormatAllowed(stringDate, internalFormat);

    if (!isValid) {
      return "Invalid format. Use DATE and TIME separated by a space.";
    }

    if (!isValidTime(time)) {
      return "Invalid time format. Use HH:mm.";
    }
    const isoDate = formatDateToValidCalendarDateFormat(stringDate);
    const validDate = new Date(isoDate);

    if (minDate) {
      const minDateValue = new Date(minDate);
      if (validDate < minDateValue) {
        const formattedMinDate = format(minDateValue, "dd/MM/yyyy");
        return `Date must be on or after ${formattedMinDate}.`;
      }
    }

    if (maxDate) {
      const maxDateValue = new Date(maxDate);
      if (validDate > maxDateValue) {
        const formattedMaxDate = format(maxDateValue, "dd/MM/yyyy");
        return `Date must be on or before ${formattedMaxDate}.`;
      }
    }

    return true;
  };
