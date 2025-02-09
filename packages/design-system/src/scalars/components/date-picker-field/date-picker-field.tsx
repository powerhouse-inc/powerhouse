import { forwardRef } from "react";
import { FieldCommonProps } from "../types";
import { DateFieldValue } from "./types";
import { withFieldValidation } from "../fragments/with-field-validation";

import { BasePickerField } from "../date-time-field/base-picker-field";
import { FormGroup } from "../fragments/form-group";
import { FormLabel } from "../fragments/form-label";
import { FormMessageList } from "../fragments/form-message";
import { FormDescription } from "../fragments/form-description";
import { Calendar } from "./subcomponents/calendar/calendar";
import { cn } from "@/scalars/lib/utils";
import { useDatePickerField } from "./use-date-picker-field";

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
    const {
      date,
      inputValue,
      handleDateSelect,
      handleInputChange,
      isOpen,
      setIsOpen,
      formatDate,
    } = useDatePickerField({
      value,
      defaultValue,
    });

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
          value={formatDate(inputValue)}
          name={name}
          errors={errors}
          disabled={disabled}
          required={required}
          iconName="CalendarTime"
          placeholder={placeholder}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          onInputChange={handleInputChange}
          {...props}
        >
          <Calendar
            mode="single"
            required={true}
            selected={date}
            onSelect={handleDateSelect}
            className={cn(
              "w-full",
              "p-0",
              // dark
              "dark:text-gray-500",
              // custom styles
              "font-inter",
              "text-[14px]",
              "font-semibold",
              "leading-[22px]",
            )}
            weekdaysClassName={cn(
              "h-[34px]",
              "gap-x-[3px]",
              "dark:text-gray-600",
            )}
            monthGridClassName={cn("w-full", "pr-[5.5px] pl-[5.5px]")}
            dayClassName={cn(
              "w-[34px] hover:bg-gray-200 hover:rounded-[4px] cursor-pointer",
              // dark
              "dark:text-gray-50 hover:dark:bg-gray-900",
            )}
            buttonPreviousClassName={cn(
              "border border-gray-200",
              "hover:bg-gray-200 dark:hover:bg-gray-900",
              // dark
              "dark:border-gray-900 dark:text-gray-300",
            )}
            buttonNextClassName={cn(
              "border border-gray-200 ",
              "hover:bg-gray-200 dark:hover:bg-gray-900",
              // dark
              "dark:text-gray-300 dark:border-gray-900",
            )}
            todayClassName={cn(
              "rounded-[4px]",
              "bg-gray-100",
              // dark
              "dark:bg-gray-900 dark:text-gray-50",
            )}
            selectedClassName={cn(
              "rounded-[4px]",
              "bg-gray-900 text-white",
              "hover:bg-gray-900 hover:text-white",
              // dark
              "dark:bg-gray-50 dark:text-gray-900",
              "dark:hover:bg-gray-50 dark:hover:text-gray-900",
            )}
            weekClassName={cn("w-full")}
            {...props}
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
