import { cn } from "#scalars";
import type React from "react";
import { forwardRef } from "react";
import { type DateFieldValue } from "../../../ui/components/data-entry/date-picker/types.js";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
} from "../fragments/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/with-field-validation.js";
import { type InputBaseProps } from "../types.js";
import { BasePickerField } from "./base-picker-field.js";
import DateTimePickerContent from "./date-time-contet.js";
import { dateTimeFieldValidations } from "./date-time-field-validations.js";
import { useDateTime } from "./use-date-time.js";

interface DateTimePickerProps extends InputBaseProps<DateFieldValue> {
  name: string;
  id?: string;
  label?: string;
  value?: DateFieldValue;
  defaultValue?: DateFieldValue;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  timeFormat?: string;
  timeIntervals?: number;
  timeZone?: string;
  showTimezoneSelect?: boolean;
  includeContinent?: boolean;
  // Date Picker Field
  disablePastDates?: boolean;
  disableFutureDates?: boolean;
  dateFormat?: string;
  weekStart?: string;
  autoClose?: boolean;
  minDate?: string;
  maxDate?: string;
  onChangeDate?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlurDate?: (e: React.FocusEvent<HTMLInputElement>) => void;
}
const DateTimeRaw = forwardRef<HTMLInputElement, DateTimePickerProps>(
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
      onChange,
      onBlur,

      // Date Picker Field
      disablePastDates,
      disableFutureDates,
      dateFormat,
      weekStart,
      autoClose,
      minDate,
      maxDate,
      onChangeDate,
      onBlurDate,
      timeFormat,
      // Time Picker Field
      timeIntervals,
      timeZone,
      showTimezoneSelect,
      includeContinent,
      ...props
    },
    ref,
  ) => {
    const {
      isOpen,
      setIsOpen,
      // inputValue,
      activeTab,
      onChangeTabs,
      isCalendarView,
      dateTimeToDisplay,
      handleInputChangeField,

      // Date Picker Field
      date,
      handleDateSelect,
      disabledDates,
      weekStartDay,
      handleDayClick,
      handleOnBlur,

      // Time Picker Field
      selectedHour,
      selectedMinute,
      selectedPeriod,
      setSelectedHour,
      setSelectedMinute,
      setSelectedPeriod,
      hours,
      minutes,
      onCancel,
      handleSave,
      timeZonesOptions,
      selectedTimeZone,
      is12HourFormat,
      setSelectedTimeZone,
      isDisableSelect,
    } = useDateTime({
      value,
      defaultValue,
      onChange,
      onBlur,
      // Date Picker Field
      autoClose,
      disableFutureDates,
      disablePastDates,
      dateFormat,
      weekStart,
      onChangeDate,
      onBlurDate,
      minDate,
      maxDate,

      // Time Picker Field
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
          ref={ref}
          label={label}
          id={id}
          value={dateTimeToDisplay}
          name={name}
          errors={errors}
          disabled={disabled}
          required={required}
          iconName="CalendarTime"
          placeholder={placeholder}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          onInputChange={handleInputChangeField}
          handleBlur={handleOnBlur}
          data-cast={`DateTimeString:${dateFormat}`}
          className={cn(
            // Add custom styles when the time is open
            isCalendarView ? "px-4 pb-6 pt-3" : "px-4 pb-4 pt-3",
          )}
        >
          <DateTimePickerContent
            activeTab={activeTab}
            onChangeTabs={onChangeTabs}
            // Date Picker Field
            date={date}
            handleDateSelect={handleDateSelect}
            disabledDates={disabledDates}
            weekStartDay={weekStartDay}
            handleDayClick={handleDayClick}
            // Time Picker Field
            selectedHour={selectedHour}
            selectedMinute={selectedMinute}
            selectedPeriod={selectedPeriod}
            setSelectedHour={setSelectedHour}
            setSelectedMinute={setSelectedMinute}
            setSelectedPeriod={setSelectedPeriod}
            hours={hours}
            minutes={minutes}
            timeZonesOptions={timeZonesOptions}
            selectedTimeZone={selectedTimeZone as string}
            setSelectedTimeZone={setSelectedTimeZone}
            timeZone={timeZone}
            is12HourFormat={is12HourFormat}
            isDisableSelect={isDisableSelect}
            onCancel={onCancel}
            onSave={handleSave}
          />
        </BasePickerField>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export const DateTimeField = withFieldValidation<DateTimePickerProps>(
  DateTimeRaw,
  {
    validations: {
      _datePickerType: dateTimeFieldValidations,
    },
  },
);

DateTimeField.displayName = "DateTimeField";
