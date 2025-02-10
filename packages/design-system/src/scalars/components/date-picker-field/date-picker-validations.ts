import { format, parse, isValid } from "date-fns";
import { DatePickerFieldProps } from "./date-picker-field";
import { isFormatAllowed } from "./utils";

export const validateDatePicker =
  ({ minDate, maxDate, dateFormat }: DatePickerFieldProps) =>
  (value: unknown) => {
    if (value === "") {
      return true;
    }
    if (value === undefined) {
      return true;
    }

    if (dateFormat && !isFormatAllowed(dateFormat)) {
      return `Invalid date format.Plese select a valid format`;
    }
    const inputDate = new Date(value as string);
    const parsedDate = parse(value as string, dateFormat ?? "", new Date());
    if (!isValid(parsedDate)) {
      return `Invalid date format. Please select a valid format`;
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
