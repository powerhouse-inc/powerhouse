import {
  cn,
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  type InputBaseProps,
} from "#scalars";
import { forwardRef } from "react";
import { BasePickerField } from "../date-time-picker/base-picker.js";
import { Calendar } from "./subcomponents/calendar/calendar.js";
import type { DateFieldValue } from "./types.js";
import { useDatePickerField } from "./use-date-picker.js";

interface DatePickerProps extends InputBaseProps<DateFieldValue> {
  label?: string;
  id?: string;
  name: string;
  disabled?: boolean;
  required?: boolean;
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  inputProps?: Omit<
    InputBaseProps<DateFieldValue>,
    "name" | "onChange" | "value" | "defaultValue" | "onBlur"
  >;
  minDate?: string;
  maxDate?: string;
  disablePastDates?: boolean;
  disableFutureDates?: boolean;
  dateFormat?: string;
  weekStart?: string;
  autoClose?: boolean;
}

const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
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
      onChange,
      onBlur,
      inputProps,
      disablePastDates,
      disableFutureDates,
      dateFormat,
      weekStart,
      autoClose = false,
      minDate,
      maxDate,
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
      handleBlur,
      disabledDates,
      weekStartDay,
      handleDayClick,
    } = useDatePickerField({
      value,
      defaultValue,
      onChange,
      onBlur,
      disablePastDates,
      disableFutureDates,
      dateFormat,
      weekStart,
      autoClose,
      minDate,
      maxDate,
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
          value={inputValue}
          name={name}
          errors={errors}
          disabled={disabled}
          required={required}
          iconName="CalendarTime"
          placeholder={placeholder}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          onInputChange={handleInputChange}
          inputProps={inputProps}
          handleBlur={handleBlur}
          data-cast={`DateString:${dateFormat}`}
          className={cn(
            // custom styles
            "px-4 pb-6 pt-3",
          )}
        >
          <Calendar
            mode="single"
            selected={date}
            weekStartsOn={weekStartDay}
            onSelect={handleDateSelect}
            disabled={disabledDates}
            onDayClick={handleDayClick}
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
            monthGridClassName={cn("w-full", "px-[5.5px]")}
            dayClassName={cn(
              "w-[34px] cursor-pointer text-[12px] text-gray-900 hover:rounded-[4px] hover:bg-gray-200",
              // dark
              "dark:text-gray-50 hover:dark:bg-gray-900",
              "disabled:text-gray-300",
            )}
            buttonPreviousClassName={cn(
              "border border-gray-200",
              // hover
              "hover:border-gray-300  hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-900",
              // dark
              "dark:border-gray-900 dark:text-gray-300",
            )}
            buttonNextClassName={cn(
              "border border-gray-200",
              // hover
              "hover:border-gray-300  hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-900",
              // dark
              "dark:border-gray-900 dark:text-gray-300",
            )}
            todayClassName={cn(
              "rounded-[4px]",
              "bg-gray-100",
              // dark
              "dark:bg-gray-900 dark:text-gray-50",
              // When selected, apply these styles with !important to ensure priority
              "aria-selected:!bg-gray-900 aria-selected:!text-white",
            )}
            selectedClassName={cn(
              "rounded-[4px]",
              "bg-gray-900 text-white",
              "hover:bg-gray-900",
              // dark
              "dark:bg-gray-50 dark:text-gray-900",
              "dark:hover:bg-gray-50 dark:hover:text-gray-900",
            )}
            dayButtonClassName={cn("text-[12px] font-medium")}
            weekClassName={cn("w-full")}
            disabledClassName={cn(
              "!cursor-not-allowed !text-gray-300 hover:!bg-transparent [&>button]:hover:!bg-transparent",
            )}
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

DatePicker.displayName = "DatePicker";

export { DatePicker, type DatePickerProps };
