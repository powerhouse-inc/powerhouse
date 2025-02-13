import { format, parse, isValid } from "date-fns";
import { DatePickerFieldProps } from "./date-picker-field";
import { isFormatAllowed } from "./utils";

export const validateDatePicker =
  ({ minDate, maxDate, dateFormat = "yyyy-MM-dd" }: DatePickerFieldProps) =>
  (value: unknown) => {
    if (value === "") {
      return true;
    }
    if (value === undefined) {
      return true;
    }

    if (dateFormat && !isFormatAllowed(dateFormat)) {
      return `Invalid date format.Plese insert a valid format`;
    }
    // Parse the input value using the specified format
    const parsedDate = parse(value as string, dateFormat, new Date());
    if (!isValid(parsedDate)) {
      return `Invalid date format. Please insert a valid format`;
    }

    if (minDate) {
      const minDateValue = new Date(minDate);
      if (parsedDate < minDateValue) {
        const formattedMinDate = format(minDateValue, "yyyy-MM-dd");
        return `Date must be on or after ${formattedMinDate}`;
      }
    }

    if (maxDate) {
      const maxDateValue = new Date(maxDate);
      if (parsedDate > maxDateValue) {
        const formattedMaxDate = format(maxDateValue, "yyyy-MM-dd");
        return `Date must be on or before ${formattedMaxDate}`;
      }
    }

    return true;
  };
