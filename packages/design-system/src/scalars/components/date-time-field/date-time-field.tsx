import React from "react";
import { FieldCommonProps } from "../types";
import { DateFieldValue } from "../date-picker-field/types";
import {
  DatePickerField,
  DatePickerFieldProps,
} from "../date-picker-field/date-picker-field";
import { TimePickerField, TimePickerFieldProps } from "../time-picker-field";

interface DateTimeFieldPropsDate
  extends Omit<
    DatePickerFieldProps,
    "name" | "label" | "defaultValue" | "onChange" | "onBlur" | "placeholder"
  > {}

interface DateTimeFieldPropsTime
  extends Omit<
    TimePickerFieldProps,
    "name" | "label" | "defaultValue" | "onChange" | "onBlur" | "placeholder"
  > {}

interface DateTimeFieldProps extends FieldCommonProps<DateFieldValue> {
  showDateSelect?: boolean;
  showTimeSelect?: boolean;
  name: string;
  label?: string;
  dateProps?: DateTimeFieldPropsDate;
  timeProps?: DateTimeFieldPropsTime;
  onChange?: (value: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
}

export const DateTimeField: React.FC<DateTimeFieldProps> = ({
  showDateSelect = true,
  showTimeSelect = true,
  name,
  label,
  dateProps,
  timeProps,
  onChange,
  onBlur,
  placeholder,
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
        {...dateProps}
      />
    );
  }

  return (
    <div>
      {showDateSelect && showTimeSelect && (
        <div>
          {/* TODO: Implement DateTimePicker */}
          <div>Placeholder DateTimePicker</div>
        </div>
      )}
      {showDateSelect && !showTimeSelect && (
        <DatePickerField
          name={name}
          label={label}
          onBlur={onBlur}
          onChange={onChange}
          placeholder={placeholder}
          {...dateProps}
        />
      )}
      {!showDateSelect && showTimeSelect && (
        <TimePickerField
          name={name}
          label={label}
          onBlur={onBlur}
          onChange={onChange}
          placeholder={placeholder}
          {...timeProps}
        />
      )}
    </div>
  );
};
