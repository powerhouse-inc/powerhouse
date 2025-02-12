import { forwardRef } from "react";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  InputProps,
  SelectFieldProps,
  withFieldValidation,
} from "../fragments";
import { ErrorHandling, FieldCommonProps } from "../types";
import { TimeFieldValue } from "./type";
import { BasePickerField } from "../date-time-field/base-picker-field";
import TimePickerContent from "./subcomponents/time-picker-content";
import { useTimePickerField } from "./use-time-picker-field";
import { InputNumberProps } from "../number-field/types";
import { validateTimePicker } from "./time-picker-validations";
import { cn } from "@/scalars/lib";

export interface TimePickerFieldProps
  extends FieldCommonProps<TimeFieldValue>,
    InputNumberProps,
    ErrorHandling {
  label?: string;
  id?: string;
  name: string;
  value?: TimeFieldValue;
  defaultValue?: TimeFieldValue;
  placeholder?: string;
  inputProps?: Omit<InputProps, "name" | "onChange" | "value" | "defaultValue">;
  selectProps?: Omit<SelectFieldProps, "name" | "options" | "selectionIcon">;
  timeFormat?: string;
  showTimezoneSelect?: boolean;
  dateIntervals?: number;
}

export const TimePickerRaw = forwardRef<HTMLInputElement, TimePickerFieldProps>(
  (
    {
      label,
      id,
      errors,
      name,
      placeholder,
      value,
      onChange,
      onBlur,
      defaultValue,
      description,
      warnings,
      required,
      disabled,
      inputProps,
      selectProps,
      timeFormat = "hh:mm a",
      showTimezoneSelect,
      dateIntervals,
    },
    ref,
  ) => {
    const {
      selectedHour,
      setSelectedHour,
      selectedMinute,
      setSelectedMinute,
      selectedPeriod,
      setSelectedPeriod,
      hours,
      minutes,
      isOpen,
      setIsOpen,
      inputValue,
      handleInputChange,
      handleSave,
      handleCancel,
      timeZonesOptions,
      handleBlur,
      is12HourFormat,
      selectedTimeZone,
      setSelectedTimeZone,
    } = useTimePickerField({
      value,
      defaultValue,
      onChange,
      onBlur,
      timeFormat,
      dateIntervals,
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
          iconName="Clock"
          isOpen={isOpen}
          name={name}
          errors={errors}
          disabled={disabled}
          required={required}
          value={inputValue}
          setIsOpen={setIsOpen}
          onInputChange={handleInputChange}
          ref={ref}
          placeholder={placeholder}
          handleBlur={handleBlur}
          inputProps={inputProps}
          className={cn("pt-3 pr-4 pb-4 pl-4")}
        >
          <TimePickerContent
            selectedHour={selectedHour}
            selectedMinute={selectedMinute}
            selectedPeriod={selectedPeriod}
            setSelectedHour={setSelectedHour}
            setSelectedMinute={setSelectedMinute}
            setSelectedPeriod={setSelectedPeriod}
            hours={hours}
            minutes={minutes}
            onSave={handleSave}
            onCancel={handleCancel}
            timeZonesOptions={timeZonesOptions}
            selectProps={selectProps}
            is12HourFormat={is12HourFormat}
            showTimezoneSelect={showTimezoneSelect}
            selectedTimeZone={selectedTimeZone as string}
            setSelectedTimeZone={setSelectedTimeZone}
          />
        </BasePickerField>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export const TimePickerField = withFieldValidation<TimePickerFieldProps>(
  TimePickerRaw,
  {
    validations: {
      _timePickerType: validateTimePicker,
    },
  },
);
TimePickerField.displayName = "TimePickerField";
