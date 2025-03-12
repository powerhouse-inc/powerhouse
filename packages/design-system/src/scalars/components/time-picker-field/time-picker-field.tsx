import { cn } from "#scalars";
import { forwardRef } from "react";
import { BasePickerField } from "../date-time-field/base-picker-field.js";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  type InputProps,
  type SelectFieldProps,
} from "../fragments/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/with-field-validation.js";
import type { InputNumberProps } from "../number-field/types.js";
import { type ErrorHandling, type FieldCommonProps } from "../types.js";
import TimePickerContent from "./subcomponents/time-picker-content.js";
import { validateTimePicker } from "./time-picker-validations.js";
import { type TimeFieldValue } from "./type.js";
import { useTimePickerField } from "./use-time-picker-field.js";
import { handleKeyDown } from "./utils.js";

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
  timeIntervals?: number;
  showTimezoneSelect?: boolean;
  timeZone?: string;
}

const TimePickerRaw = forwardRef<HTMLInputElement, TimePickerFieldProps>(
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
      timeIntervals,
      timeZone,
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
      isDisableSelect,
    } = useTimePickerField({
      value,
      defaultValue,
      onChange,
      onBlur,
      timeFormat,
      timeIntervals,
      timeZone,
      showTimezoneSelect,
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
          inputProps={{
            ...inputProps,
            onKeyDown: handleKeyDown,
          }}
          className={cn("pb-4 pl-4 pr-4 pt-3")}
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
            isDisableSelect={isDisableSelect}
            selectedTimeZone={selectedTimeZone as string}
            setSelectedTimeZone={setSelectedTimeZone}
            timeZone={timeZone}
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
