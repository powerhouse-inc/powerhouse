import React, { forwardRef } from "react";
import { FieldCommonProps } from "../types";
import { DateFieldValue } from "./types";
import { withFieldValidation } from "../fragments/with-field-validation";

import { BasePickerField } from "../date-time-field/base-picker-field";
import { FormGroup } from "../fragments/form-group";
import { FormLabel } from "../fragments/form-label";
import { FormMessageList } from "../fragments/form-message";
import { FormDescription } from "../fragments/form-description";
import { Calendar } from "../fragments/calendar/calendar";
import { cn } from "@/scalars/lib/utils";

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
      description,
      warnings,
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
          <Calendar
            className={cn("w-full", "p-0")}
            weekdaysClassName={cn("h-[34px]")}
            monthGridClassName={cn("w-full")}
            dayClassName={cn(
              "w-[34px] hover:bg-gray-200 hover:rounded-[4px] cursor-pointer",
            )}
            buttonPreviousClassName={cn(
              "border border-gray-200 dark:border-gray-900",
              "hover:bg-gray-200 dark:hover:bg-gray-900",
            )}
            buttonNextClassName={cn(
              "border border-gray-200 dark:border-gray-900",
              "hover:bg-gray-200 dark:hover:bg-gray-900",
            )}
            todayClassName={cn("rounded-[4px]", "bg-gray-100")}
            selectedClassName={cn(
              "rounded-[4px]",
              "bg-gray-900 text-white",
              "hover:bg-gray-900 hover:text-white",
            )}
          />
        </BasePickerField>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export const DatePickerField =
  withFieldValidation<DatePickerFieldProps>(DatePickerRaw);

DatePickerField.displayName = "DatePickerField";
