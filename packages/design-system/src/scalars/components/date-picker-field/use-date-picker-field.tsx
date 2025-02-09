import React, { useCallback, useMemo } from "react";
import { DateFieldValue, WeekStartDayNumber } from "./types";
import { format, isValid, parse, startOfDay } from "date-fns";
import { createChangeEvent } from "../time-picker-field/utils";
interface DatePickerFieldProps {
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  disablePastDates?: boolean;
  disableFutureDates?: boolean;
  dateFormat?: string;
  weekStart?: string;
}

export const useDatePickerField = ({
  value,
  defaultValue,
  onChange,
  onBlur,
  disablePastDates,
  disableFutureDates,
  dateFormat = "yyyy-MM-dd",
  weekStart = "Monday",
}: DatePickerFieldProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const changeEvent = createChangeEvent(newValue);
    onChange?.(changeEvent);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    onBlur?.(e);
  };

  const handleDateSelect = useCallback(
    (date?: Date) => {
      if (date && isValid(date)) {
        const formattedDate = format(date, dateFormat);
        const changeEvent = createChangeEvent(formattedDate);
        onChange?.(changeEvent);
      } else {
        const changeEvent = createChangeEvent("");
        onChange?.(changeEvent);
      }
    },
    [dateFormat, onChange],
  );

  const formatDate = React.useCallback(
    (value: DateFieldValue): string => {
      if (!value) return "";
      if (typeof value === "string") {
        return value;
      }
      if (typeof value === "number") {
        const date = new Date(value);
        if (isValid(date)) {
          const newValue = format(date, dateFormat);
          const changeEvent = createChangeEvent(newValue);
          onChange?.(changeEvent);
        }
      }
      if (typeof value === "object" && isValid(value)) {
        return format(value, dateFormat);
      }

      return "";
    },
    [dateFormat, onChange],
  );
  const inputValue = formatDate(value ?? defaultValue ?? "");
  const parsedDate = parse(inputValue, dateFormat, new Date());
  const date = isValid(parsedDate) ? parsedDate : undefined;

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

  return {
    date,
    inputValue,
    handleDateSelect,
    handleInputChange,
    isOpen,
    setIsOpen,
    formatDate,
    handleBlur,
    disabledDates,
    weekStartDay,
  };
};
