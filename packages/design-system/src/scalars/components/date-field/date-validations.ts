import { format } from "date-fns";
import { type DateFieldProps } from "./date-field.js";
import { type DateFieldValue } from "./types.js";
import {
  formatDateToValidCalendarDateFormat,
  getDateFromValue,
} from "./utils.js";

import {
  getDateFormat,
  isDateFormatAllowed,
  normalizeMonthFormat,
} from "../date-time-field/utils.js";

export const validateDatePicker =
  ({ dateFormat, minDate, maxDate }: DateFieldProps) =>
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
