import { format } from "date-fns";
import { type DateFieldValue } from "../../../ui/components/data-entry/date-picker/types.js";

import {
  formatDateToValidCalendarDateFormat,
  getDateFromValue,
} from "../../../ui/components/data-entry/date-picker/utils.js";
import {
  getDateFormat,
  isDateFormatAllowed,
  normalizeMonthFormat,
} from "../../../ui/components/data-entry/date-time-picker/utils.js";
import { type DatePickerFieldProps } from "./date-picker-field.js";

export const validateDatePicker =
  ({
    dateFormat,
    minDate,
    maxDate,
    disablePastDates,
    disableFutureDates,
  }: DatePickerFieldProps) =>
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
        const formattedMinDate = format(
          effectiveMinDate,
          internalFormat ?? "yyyy-MM-dd",
        );
        const formattedMaxDate = format(
          effectiveMaxDate,
          internalFormat ?? "yyyy-MM-dd",
        );
        return `Invalid date range: ${formattedMinDate.toUpperCase()} is after ${formattedMaxDate.toUpperCase()}`;
      }

      if (
        validDateStartOfDay < effectiveMinDate ||
        validDateStartOfDay > effectiveMaxDate
      ) {
        const formattedMinDate = format(
          effectiveMinDate,
          internalFormat ?? "yyyy-MM-dd",
        );
        const formattedMaxDate = format(
          effectiveMaxDate,
          internalFormat ?? "yyyy-MM-dd",
        );
        return `Date should be between ${formattedMinDate.toUpperCase()} - ${formattedMaxDate.toUpperCase()}`;
      }
    } else if (effectiveMinDate) {
      if (validDateStartOfDay < effectiveMinDate) {
        const formattedMinDate = format(
          effectiveMinDate,
          internalFormat ?? "yyyy-MM-dd",
        );
        return `Date must be after ${formattedMinDate.toUpperCase()}`;
      }
    } else if (effectiveMaxDate) {
      if (validDateStartOfDay > effectiveMaxDate) {
        const formattedMaxDate = format(
          effectiveMaxDate,
          internalFormat ?? "yyyy-MM-dd",
        );
        return `Date must be before ${formattedMaxDate.toUpperCase()}`;
      }
    }

    return true;
  };
