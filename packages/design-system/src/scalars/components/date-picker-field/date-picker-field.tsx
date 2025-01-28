import React, { forwardRef } from "react";
import { FieldCommonProps } from "../types";
import { DateFieldValue } from "./types";
import { withFieldValidation } from "../fragments/with-field-validation";
import BasePickerField from "../date-time-field/base-picker-field";

export interface DatePickerFieldProps extends FieldCommonProps<DateFieldValue> {
  label?: string;
  id?: string;
  name: string;
  disabled?: boolean;
  required?: boolean;
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
  placeholder?: string;
}

const DatePickerField = forwardRef<HTMLInputElement, DatePickerFieldProps>(
  (
    {
      label,
      id,
      errors,
      name,
      disabled,
      required,
      value,
      defaultValue,
      placeholder,
      ...props
    },
    ref,
  ) => {
    // TODO: Fix this when selecting date from calendar
    const [date, setDate] = React.useState<DateFieldValue>(
      value ?? defaultValue ?? "",
    );
    const [inputValue, setInputValue] = React.useState("");
    const [isOpen, setIsOpen] = React.useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      const parsedDate = new Date(e.target.value);
      if (!isNaN(parsedDate.getTime())) {
        setDate(parsedDate);
      }
    };

    return (
      <BasePickerField
        ref={ref}
        label={label}
        id={id}
        value={inputValue}
        name={name}
        errors={errors}
        disabled={disabled}
        required={required}
        iconName="CalendarTime"
        placeholder={placeholder}
        defaultValue={defaultValue}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        onInputChange={handleInputChange}
        {...props}
      >
        {/* TODO: Add calendar */}
      </BasePickerField>
    );
  },
);

DatePickerField.displayName = "DatePickerField";

export default withFieldValidation<DatePickerFieldProps>(DatePickerField, {});
