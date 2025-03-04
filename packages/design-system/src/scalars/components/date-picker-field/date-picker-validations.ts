import { format } from "date-fns";
import { DatePickerFieldProps } from "./date-picker-field";
import {
  formatDateToValidCalendarDateFormat,
  getDateFormat,
  getDateFromValue,
  normalizeMonthFormat,
} from "./utils";
import { DateFieldValue } from "./types";
import { isDateFormatAllowed } from "../date-time-field/utils";

export const validateDatePicker =
  ({ minDate, maxDate, dateFormat }: DatePickerFieldProps) =>
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
    const isoDate = formatDateToValidCalendarDateFormat(stringDate);
    const validDate = new Date(isoDate);
    if (minDate) {
      const minDateValue = new Date(minDate);
      if (validDate < minDateValue) {
        const formattedMinDate = format(minDateValue, "yyyy-MM-dd");
        return `Date must be on or after ${formattedMinDate}`;
      }
    }

    if (maxDate) {
      const maxDateValue = new Date(maxDate);
      if (validDate > maxDateValue) {
        const formattedMaxDate = format(maxDateValue, "yyyy-MM-dd");
        return `Date must be on or before ${formattedMaxDate}`;
      }
    }

    return true;
  };
