import { format, parse, isValid } from "date-fns";
import { DatePickerFieldProps } from "./date-picker-field";
import { ALLOWED_FORMATS, dateFormatRegexes, isFormatAllowed } from "./utils";

export const validateDatePicker =
  ({ minDate, maxDate, dateFormat }: DatePickerFieldProps) =>
  (value: unknown) => {
    if (value === "" || value === undefined) {
      return true;
    }

    if (dateFormat) {
      if (!isFormatAllowed(dateFormat)) {
        return `Invalid date format. Please use a valid format`;
      }
      const parsedDate = parse(value as string, dateFormat, new Date());
      if (!isValid(parsedDate)) {
        return `Invalid date. Please use a valid format`;
      }
    }
    const isValidFormat = Object.values(dateFormatRegexes).some((regex) =>
      regex.test(value as string),
    );
    if (!isValidFormat) {
      return `Invalid date. Please use a valid format`;
    }

    // Intentar con todos los formatos permitidos
    let validDate: Date | null = null;
    for (const format of ALLOWED_FORMATS) {
      const attemptParse = parse(value as string, format, new Date());
      if (isValid(attemptParse)) {
        validDate = attemptParse;
        break;
      }
    }

    // Si ningún formato funcionó
    if (!validDate) {
      return `Invalid date. Please use a valid format`;
    }
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
