import React from "react";
import {
  DatePickerField,
  type DatePickerFieldProps,
} from "../date-picker-field/date-picker-field.js";
import type { DateFieldValue } from "../date-picker-field/types.js";
import {
  TimePickerField,
  type TimePickerFieldProps,
} from "../time-picker-field/index.js";
import type { TimeFieldValue } from "../time-picker-field/type.js";
import type { FieldErrorHandling, InputBaseProps } from "../types.js";
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
  extends Omit<DatePickerFieldProps, CommonOmittedProps> {
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
}

interface DateTimeFieldPropsTime
  extends Omit<TimePickerFieldProps, CommonOmittedProps> {
  value?: TimeFieldValue;
  defaultValue?: TimeFieldValue;
}

interface DateTimeFieldProps
  extends Omit<InputBaseProps<any>, "value" | "defaultValue">,
    FieldErrorHandling {
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
      showDateSelect = true,
      showTimeSelect = true,
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
    if (!showDateSelect && !showTimeSelect) {
      return (
        <DatePickerField
          name={name}
          label={label}
          onBlur={onBlur}
          onChange={onChange}
          placeholder={placeholder}
          dateFormat={dateFormat}
          minDate={minDate}
          maxDate={maxDate}
          weekStart={weekStart}
          disablePastDates={disablePastDates}
          disableFutureDates={disableFutureDates}
          autoClose={autoClose}
          ref={ref}
          {...props}
        />
      );
    }

    return (
      <div>
        {showDateSelect && showTimeSelect && (
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
        )}
        {showDateSelect && !showTimeSelect && (
          <DatePickerField
            name={name}
            label={label}
            onBlur={onBlur}
            onChange={onChange}
            placeholder={placeholder}
            dateFormat={dateFormat}
            minDate={minDate}
            maxDate={maxDate}
            weekStart={weekStart}
            disablePastDates={disablePastDates}
            disableFutureDates={disableFutureDates}
            autoClose={autoClose}
            ref={ref}
            {...props}
          />
        )}
        {!showDateSelect && showTimeSelect && (
          <TimePickerField
            name={name}
            label={label}
            onBlur={onBlur}
            onChange={onChange}
            placeholder={placeholder}
            timeFormat={timeFormat}
            showTimezoneSelect={showTimezoneSelect}
            timeZone={timeZone}
            timeIntervals={timeIntervals}
            ref={ref}
            {...props}
          />
        )}
      </div>
    );
  },
);

DateTimeField.displayName = "DateTimeField";
