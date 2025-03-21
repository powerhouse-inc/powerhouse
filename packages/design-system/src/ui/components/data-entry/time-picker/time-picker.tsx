/* eslint-disable prettier/prettier */
import {
  cn,
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  type InputBaseProps,
  type SelectFieldProps
} from "#scalars";
import { forwardRef } from "react";
import { BasePickerField } from "../../../../scalars/components/date-time-field/base-picker-field.js";
import { type InputNumberProps } from "../../../../scalars/components/number-field/types.js";
import TimePickerContent from "./subcomponents/time-picker-content.js";
import { type TimeFieldValue } from "./type.js";
import { useTimePickerField } from "./use-time-field.js";
import { handleKeyDown } from "./utils.js";

interface TimePickerProps
  extends InputBaseProps<TimeFieldValue>,
    Omit<InputNumberProps, 'value' | 'defaultValue'> {
  label?: string;
  id?: string;
  name: string;
  value?: TimeFieldValue;
  defaultValue?: TimeFieldValue;
  placeholder?: string;
  inputProps?: Omit<
    InputBaseProps<string>,
    "name" | "onChange" | "value" | "defaultValue"
  >;
  selectProps?: Omit<SelectFieldProps, "name" | "options" | "selectionIcon">;
  timeFormat?: string;
  timeIntervals?: number;
  showTimezoneSelect?: boolean;
  timeZone?: string;
  includeContinent?: boolean;
}

const TimePicker = forwardRef<HTMLInputElement, TimePickerProps>(
  (
    {
      label,
      id,
      errors,
      name,
      placeholder,
      value,
      defaultValue,
      onChange,
      onBlur,
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
      includeContinent,
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
      includeContinent,
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

TimePicker.displayName = "TimePicker";

export { TimePicker, type TimePickerProps };
