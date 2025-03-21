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
  ({
    dateFormat,
    minDate,
    maxDate,
    disablePastDates,
    disableFutureDates,
  }: DateFieldProps) =>
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
    // Split the date and time parts
    const [datePart] = isoDate.split("T");
    // Create a valid date object with the date part and set the time to 00:00:00
    const validDateStartOfDay = new Date(`${datePart}T00:00:00`);

    // Get the most restrictive date between minDate and disablePastDates
    let effectiveMinDate: Date | null = null;
    if (minDate) {
      const minDateValue = new Date(minDate);
      effectiveMinDate = new Date(minDateValue.setHours(0, 0, 0, 0));
    }
    if (disablePastDates) {
      const today = new Date();
      const todayStartOfDay = new Date(today.setHours(0, 0, 0, 0));
      if (!effectiveMinDate || todayStartOfDay > effectiveMinDate) {
        effectiveMinDate = todayStartOfDay;
      }
    }

    // Get the most restrictive date between maxDate and disableFutureDates
    let effectiveMaxDate: Date | null = null;
    if (maxDate) {
      const maxDateValue = new Date(maxDate);
      effectiveMaxDate = new Date(maxDateValue.setHours(0, 0, 0, 0));
    }
    if (disableFutureDates) {
      const today = new Date();
      const todayStartOfDay = new Date(today.setHours(0, 0, 0, 0));
      if (!effectiveMaxDate || todayStartOfDay < effectiveMaxDate) {
        effectiveMaxDate = todayStartOfDay;
      }
    }

    // Validate against the effective dates
    if (effectiveMinDate && effectiveMaxDate) {
      if (effectiveMinDate > effectiveMaxDate) {
        const formattedMinDate = format(effectiveMinDate, "dd/MM/yyyy");
        const formattedMaxDate = format(effectiveMaxDate, "dd/MM/yyyy");
        return `Invalid date range: ${formattedMinDate} is after ${formattedMaxDate}`;
      }

      if (
        validDateStartOfDay < effectiveMinDate ||
        validDateStartOfDay > effectiveMaxDate
      ) {
        const formattedMinDate = format(effectiveMinDate, "dd/MM/yyyy");
        const formattedMaxDate = format(effectiveMaxDate, "dd/MM/yyyy");
        return `Date should be between ${formattedMinDate} - ${formattedMaxDate}`;
      }
    } else if (effectiveMinDate) {
      if (validDateStartOfDay < effectiveMinDate) {
        const formattedMinDate = format(effectiveMinDate, "dd/MM/yyyy");
        return `Date must be after ${formattedMinDate}`;
      }
    } else if (effectiveMaxDate) {
      if (validDateStartOfDay > effectiveMaxDate) {
        const formattedMaxDate = format(effectiveMaxDate, "dd/MM/yyyy");
        return `Date must be before ${formattedMaxDate}`;
      }
    }

    return true;
  };
