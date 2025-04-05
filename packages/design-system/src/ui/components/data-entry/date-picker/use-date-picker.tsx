import { parse, startOfDay } from "date-fns";
import React, { useCallback, useMemo } from "react";

import {
  getDateFormat,
  normalizeMonthFormat,
  parseDateValue,
  parseInputString,
} from "../date-time-picker/utils.js";
import { createChangeEvent } from "../time-picker/utils.js";
import type { DateFieldValue, WeekStartDayNumber } from "./types.js";
import {
  formatDateToValue,
  formatUTCDateToISOStringWithOutTime,
  getDateFromValue,
} from "./utils.js";

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

  const disabledDates = useMemo(() => {
    let beforeDate: Date | undefined;
    let afterDate: Date | undefined;
    const minDateObj = parseDateValue(minDate);
    const maxDateObj = parseDateValue(maxDate);
    const todayDate = startOfDay(today);
    // If we have both disablePastDates and disableFutureDates, only today is valid
    if (disablePastDates && disableFutureDates) {
      beforeDate = todayDate;
      afterDate = todayDate;
    } else {
      // Determine beforeDate (minimum allowed date)
      if (minDateObj && disablePastDates) {
        beforeDate = minDateObj > todayDate ? minDateObj : todayDate;
      } else if (minDateObj) {
        beforeDate = minDateObj;
      } else if (disablePastDates) {
        beforeDate = todayDate;
      }

      // Determine afterDate (maximum allowed date)
      if (maxDateObj && disableFutureDates) {
        afterDate = maxDateObj < todayDate ? maxDateObj : todayDate;
      } else if (maxDateObj) {
        afterDate = maxDateObj;
      } else if (disableFutureDates) {
        afterDate = todayDate;
      }
    }

    // If beforeDate is greater than afterDate, disable all dates
    if (beforeDate && afterDate && beforeDate > afterDate) {
      // Use a date in the past as before and after to disable everything
      const disableAllDates = new Date(0); // 1970-01-01
      return { before: disableAllDates, after: disableAllDates };
    }

    if (beforeDate && afterDate) {
      return { before: beforeDate, after: afterDate };
    } else if (beforeDate) {
      return { before: beforeDate };
    } else if (afterDate) {
      return { after: afterDate };
    }

    return undefined;
  }, [disablePastDates, disableFutureDates, today, minDate, maxDate]);
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
