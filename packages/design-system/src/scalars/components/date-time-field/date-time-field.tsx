import React from "react";
import { type DateFieldProps } from "../date-field/date-field.js";
import type { DateFieldValue } from "../date-field/types.js";
import { type TimeFieldProps } from "../time-field/time-field.js";
import type { TimeFieldValue } from "../time-field/type.js";
import type { ErrorHandling, FieldCommonProps } from "../types.js";
import { DateTimeField as DateTimeRaw } from "./date-time.js";

type CommonOmittedProps =
  | "name"
  | "label"
  | "value"
  | "defaultValue"
  | "onChange"
  | "onBlur"
  | "placeholder";

interface DateTimeFieldPropsDate
  extends Omit<DateFieldProps, CommonOmittedProps> {
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
}

interface DateTimeFieldPropsTime
  extends Omit<TimeFieldProps, CommonOmittedProps> {
  value?: TimeFieldValue;
  defaultValue?: TimeFieldValue;
}

interface DateTimeFieldProps
  extends Omit<FieldCommonProps<any>, "value" | "defaultValue">,
    ErrorHandling {
  showDateSelect?: boolean;
  showTimeSelect?: boolean;
  name: string;
  label?: string;
  onChange?: (value: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;

  // Specific DateTimeField props
  dateFormat?: string;
  weekStart?: string;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
  disablePastDates?: boolean;
  disableFutureDates?: boolean;
  autoClose?: boolean;
  // Time picker props
  showTimezoneSelect?: boolean;
  timeFormat?: string;
  timeZone?: string;
  timeIntervals?: number;
  includeContinent?: boolean;
}

export const DateTimeField = React.forwardRef<
  HTMLInputElement,
  DateTimeFieldProps & DateTimeFieldPropsDate & DateTimeFieldPropsTime
>(
  (
    {
      name,
      label,
      dateFormat = "yyyy-MM-dd",
      timeFormat = "hh:mm a",
      minDate,
      maxDate,
      onChange,
      onBlur,
      placeholder,
      weekStart,
      disablePastDates,
      disableFutureDates,
      autoClose,
      showTimezoneSelect,
      value,
      timeZone,
      timeIntervals,
      includeContinent,
      ...props
    },
    ref,
  ) => {
    return (
      <DateTimeRaw
        name={name}
        value={value}
        placeholder={placeholder}
        label={label}
        weekStart={weekStart}
        autoClose={autoClose}
        disableFutureDates={disableFutureDates}
        disablePastDates={disablePastDates}
        minDate={minDate}
        maxDate={maxDate}
        dateFormat={dateFormat}
        onChange={onChange}
        onBlur={onBlur}
        timeZone={timeZone}
        timeFormat={timeFormat}
        timeIntervals={timeIntervals}
        showTimezoneSelect={showTimezoneSelect}
        includeContinent={includeContinent}
        ref={ref}
        {...props}
      />
    );
  },
);

DateTimeField.displayName = "DateTimeField";
