import { format } from "date-fns";
import { DatePickerFieldProps } from "./date-picker-field";

export const validateDatePicker =
  ({ minDate, maxDate }: DatePickerFieldProps) =>
  (value: unknown) => {
    if (value === "") {
      return true;
    }
    if (value === undefined) {
      return true;
    }
    const inputDate = new Date(value as string);
    if (isNaN(inputDate.getTime())) {
      return "Invalid date format";
    }

    if (minDate) {
      const minDateValue = new Date(minDate);
      if (inputDate < minDateValue) {
        const formattedMinDate = format(minDateValue, "yyyy-MM-dd");
        return `Date must be on or after ${formattedMinDate}`;
      }
    }

    if (maxDate) {
      const maxDateValue = new Date(maxDate);
      if (inputDate > maxDateValue) {
        const formattedMaxDate = format(maxDateValue, "yyyy-MM-dd");
        return `Date must be on or before ${formattedMaxDate}`;
      }
    }

    return true;
  };
