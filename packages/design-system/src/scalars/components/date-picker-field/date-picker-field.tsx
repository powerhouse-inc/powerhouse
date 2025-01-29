import React, { forwardRef } from "react";
import { FieldCommonProps } from "../types";
import { DateFieldValue } from "./types";
import { withFieldValidation } from "../fragments/with-field-validation";

import { BasePickerField } from "../date-time-field/base-picker-field";
import { FormGroup } from "../fragments/form-group";
import { FormLabel } from "../fragments/form-label";

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

export const DatePickerRaw = forwardRef<HTMLInputElement, DatePickerFieldProps>(
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={required}
            disabled={disabled}
            hasError={!!errors?.length}
          >
            {label}
          </FormLabel>
        )}
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
      </FormGroup>
    );
  },
);

export const DatePickerField =
  withFieldValidation<DatePickerFieldProps>(DatePickerRaw);

DatePickerField.displayName = "DatePickerField";
