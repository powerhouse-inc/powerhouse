import React from "react";
import { ErrorHandling, FieldCommonProps } from "../types";
import { DateFieldValue } from "../date-picker-field/types";
import {
  DatePickerField,
  DatePickerFieldProps,
} from "../date-picker-field/date-picker-field";
import { TimePickerField, TimePickerFieldProps } from "../time-picker-field";
import { TimeFieldValue } from "../time-picker-field/type";
import { DateTimeField as DateTimeRaw } from "./date-time";

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
  dateIntervals?: number;
}
export const DateTimeField: React.FC<
  DateTimeFieldProps & DateTimeFieldPropsDate & DateTimeFieldPropsTime
> = ({
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
  dateIntervals,
  ...props
}) => {
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
          dateIntervals={dateIntervals}
          {...props}
        />
      )}
    </div>
  );
};
