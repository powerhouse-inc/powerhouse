import { format, isValid, parse, startOfDay } from "date-fns";
import React, { useCallback, useMemo } from "react";
import { createChangeEvent } from "../time-picker-field/utils";
import { DateFieldValue, WeekStartDayNumber } from "./types";
import {
  ALLOWED_FORMATS,
  dateFormatRegexes,
  isDateFormatAllowed,
} from "./utils";

interface DatePickerFieldProps {
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  disablePastDates?: boolean;
  disableFutureDates?: boolean;
  dateFormat?: string;
  weekStart?: string;
  autoClose?: boolean;
}

const splitDateTime = (
  value: DateFieldValue,
): { date: string; time: string } => {
  const defaultResult = { date: "", time: "" };

  if (!value) {
    return defaultResult;
  }

  if (typeof value === "string") {
    const [date, time] = value.split("T");
    return { date, time };
  }

  if (isValid(value)) {
    const dateString = value.toISOString();
    const [date, time] = dateString.split("T");
    return { date, time };
  }

  return defaultResult;
};

export const getDateFromValue = (value: DateFieldValue): string => {
  const { date } = splitDateTime(value);
  return date;
};

export const parseInputString = (
  inputString: string,
  dateFormat = ALLOWED_FORMATS[0],
): string => {
  if (!dateFormat || !inputString) return inputString;

  for (const [formatStr, regex] of Object.entries(dateFormatRegexes)) {
    if (regex.test(inputString)) {
      const parsedDate = parse(inputString, formatStr, new Date());
      if (isValid(parsedDate)) {
        const newValue = format(parsedDate, dateFormat || formatStr);
        return newValue;
      }
    }
  }
  return inputString;
};

const formatDateToValue = (inputString: string): string => {
  // Add the time and the timezone to the date to split it later by T
  const stringDate = `${inputString}T00:00-00:00`;
  return stringDate;
};

export const useDatePickerField = ({
  value,
  defaultValue,
  onChange,
  onBlur,
  disablePastDates,
  disableFutureDates,
  dateFormat,
  weekStart = "Monday",
  autoClose = false,
}: DatePickerFieldProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputDisplay, setInputDisplay] = React.useState<string | undefined>(
    parseInputString(getDateFromValue(value ?? defaultValue ?? ""), dateFormat),
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setInputDisplay(inputValue);
    const newValue = formatDateToValue(inputValue);
    onChange?.(createChangeEvent(newValue));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(e);
  };

  const handleDateSelect = useCallback(
    (date?: Date) => {
      if (!date) return;
      const stringDate = date.toISOString();
      const stringDateFromValue = getDateFromValue(
        stringDate as DateFieldValue,
      );

      const newInputValue = parseInputString(stringDateFromValue, dateFormat);
      setInputDisplay(newInputValue);

      const newValue = formatDateToValue(newInputValue);
      onChange?.(createChangeEvent(newValue));
    },
    [dateFormat, onChange],
  );

  const today = useMemo(() => startOfDay(new Date()), []);

  const disabledDates = useMemo(
    () =>
      disablePastDates && disableFutureDates
        ? {
            before: today,
            after: today,
          }
        : disablePastDates
          ? {
              before: today,
            }
          : disableFutureDates
            ? {
                after: today,
              }
            : undefined,
    [disablePastDates, disableFutureDates, today],
  );

  const weekStartDay = useMemo(() => {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const dayIndex = days.indexOf(weekStart.toLowerCase());
    return (dayIndex >= 0 ? dayIndex : 1) as WeekStartDayNumber;
  }, [weekStart]);

  // Close the calendar when a date is selected
  const handleDayClick = () => {
    if (autoClose) {
      setIsOpen(false);
    }
  };

  const date = useMemo(() => {
    if (!value) return undefined;

    const dateString = getDateFromValue(value);
    const isValidDate = isDateFormatAllowed(dateString);
    if (!isValidDate) return undefined;

    const dateStringFormatted = parseInputString(dateString, "yyyy-MM-dd");
    // Convert the local time to UTC
    const fechaUTC = new Date(dateStringFormatted);
    const fechaLocalSinZona = new Date(fechaUTC);
    const offsetMinutos = fechaLocalSinZona.getTimezoneOffset();
    fechaLocalSinZona.setTime(
      fechaLocalSinZona.getTime() + offsetMinutos * 60 * 1000,
    );

    return fechaLocalSinZona;
  }, [value]);

  return {
    date,
    inputValue: inputDisplay,
    handleDateSelect,
    handleInputChange,
    isOpen,
    setIsOpen,
    handleBlur,
    disabledDates,
    weekStartDay,
    handleDayClick,
  };
};
