import { format } from "date-fns";
import { type DatePickerFieldProps } from "./date-picker-field";
import { getDateFromValue, isDateFormatAllowed } from "./utils";
import { type DateFieldValue } from "./types";

export const validateDatePicker =
  ({ minDate, maxDate, dateFormat }: DatePickerFieldProps) =>
  (value: unknown) => {
    if (value === "" || value === undefined) {
      return true;
    }
    const stringDate = getDateFromValue(value as DateFieldValue);
    const isValid = isDateFormatAllowed(stringDate, dateFormat);

    if (!isValid) {
      return `Invalid date format. Please use a valid format`;
    }

    const validDate = new Date(value as string);

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
