import { parse, startOfDay } from "date-fns";
import React, { useCallback, useMemo } from "react";
import { DateFieldValue, WeekStartDayNumber } from "./types";
import {
  formatDateToValue,
  formatUTCDateToISOStringWithOutTime,
  getDateFromValue,
} from "./utils";
import { createChangeEvent } from "../time-picker-field/utils";
import {
  getDateFormat,
  normalizeMonthFormat,
  parseInputString,
} from "../date-time-field/utils";

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
  minDate?: string;
  maxDate?: string;
}

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
  minDate,
  maxDate,
}: DatePickerFieldProps) => {
  const internalFormat = getDateFormat(dateFormat ?? "");
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputDisplay, setInputDisplay] = React.useState<string | undefined>(
    parseInputString(
      getDateFromValue(value ?? defaultValue ?? ""),
      internalFormat,
    ),
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setInputDisplay(inputValue);
    onChange?.(createChangeEvent(inputValue));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(e);
  };

  const handleDateSelect = useCallback(
    (date?: Date) => {
      if (!date) return;

      // Get LOCAL date components
      const localYear = date.getFullYear();
      const localMonth = date.getMonth();
      const localDay = date.getDate();
      // Create UTC date representing the same local date
      const utcDate = new Date(Date.UTC(localYear, localMonth, localDay));
      // Take the date without time in ISO format
      const inputValue = formatUTCDateToISOStringWithOutTime(utcDate);
      // Parse the date to the correct format
      const newInputValue = parseInputString(inputValue, internalFormat);
      setInputDisplay(newInputValue.toUpperCase());
      const newValue = formatDateToValue(utcDate);

      const newValueOnchage = `${newInputValue.toUpperCase()}T${newValue.split("T")[1]}`;

      onChange?.(createChangeEvent(newValueOnchage));
    },
    [internalFormat, onChange],
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
            : minDate && maxDate
              ? {
                  before: minDate as unknown as Date,
                  after: maxDate as unknown as Date,
                }
              : minDate
                ? {
                    before: minDate as unknown as Date,
                  }
                : maxDate
                  ? {
                      after: maxDate as unknown as Date,
                    }
                  : undefined,
    [disablePastDates, disableFutureDates, today, minDate, maxDate],
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
    const isValidDate = normalizeMonthFormat(dateString);
    if (!isValidDate) return undefined;

    const dateStringFormatted = parseInputString(dateString, internalFormat);
    const fechaUTC = parse(
      dateStringFormatted,
      internalFormat ?? "yyyy-MM-dd",
      new Date(),
    );

    return fechaUTC;
  }, [value, internalFormat]);
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
