import { cn } from "#scalars";
import type React from "react";
import { forwardRef } from "react";
import { type DateFieldValue } from "../date-picker-field/types.js";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
} from "../fragments/index.js";
import { type FieldCommonProps } from "../types.js";
import { BasePickerField } from "./base-picker-field.js";
import DateTimePickerContent from "./date-time-picker-contet.js";
import { useDateTimePicker } from "./use-date-time-picker.js";

interface DateTimePickerProps extends FieldCommonProps<DateFieldValue> {
  name: string;
  id?: string;
  label?: string;
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  timeFormat?: string;
  dateIntervals?: number;
  timeZone?: string;
  showTimezoneSelect?: boolean;
}
const DateTimePickerRaw = forwardRef<HTMLInputElement, DateTimePickerProps>(
  (
    {
      name,
      id,
      label,
      value,
      defaultValue,
      errors,
      disabled,
      required,
      placeholder,
      description,
      warnings,
      // Time Picker Field
      onChange: onChangeTime,
      onBlur: onBlurTime,
      timeFormat,
      dateIntervals,
      timeZone,
      showTimezoneSelect,
    },
    ref,
  ) => {
    const {
      isOpen,
      setIsOpen,
      inputValue,
      activeTab,
      onChangeTabs,
      isCalendarView,
      // Time Picker Field
      selectedHour,
      selectedMinute,
      selectedPeriod,
      setSelectedHour,
      setSelectedMinute,
      setSelectedPeriod,
      hours,
      minutes,
    } = useDateTimePicker({
      value,
      defaultValue,
      onChange: onChangeTime,
      onBlur: onBlurTime,
      timeFormat,
      dateIntervals,
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
          onInputChange={() => {}}
          handleBlur={() => {}}
          className={cn(
            // Add custom styles when the time is open
            isCalendarView ? "px-4 pb-6 pt-3" : "pb-4 pl-4 pr-4 pt-3",
          )}
        >
          <DateTimePickerContent
            activeTab={activeTab}
            onChangeTabs={onChangeTabs}
            selectedHour={selectedHour}
            selectedMinute={selectedMinute}
            selectedPeriod={selectedPeriod}
            setSelectedHour={setSelectedHour}
            setSelectedMinute={setSelectedMinute}
            setSelectedPeriod={setSelectedPeriod}
            hours={hours}
            minutes={minutes}
            timeZonesOptions={[]}
            is12HourFormat={true}
            isDisableSelect={false}
          />
        </BasePickerField>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export default DateTimePickerRaw;
