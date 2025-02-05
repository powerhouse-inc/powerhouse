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
import { FieldCommonProps } from "../types";
import { TimeFieldValue } from "./type";
import { BasePickerField } from "../date-time-field/base-picker-field";
import TimePickerContent from "./subcomponents/time-picker-content";
import { useTimePickerField } from "./use-time-picker-field";
import { InputNumberProps } from "../number-field/types";

interface TimePickerFieldProps
  extends FieldCommonProps<TimeFieldValue>,
    InputNumberProps {
  label?: string;
  id?: string;
  name: string;
  value?: TimeFieldValue;
  defaultValue?: TimeFieldValue;
  placeholder?: string;
  inputProps?: Omit<InputProps, "name" | "onChange" | "value" | "defaultValue">;
  selectProps?: Omit<SelectFieldProps, "name" | "options" | "selectionIcon">;
}

export const TimePickerRaw = forwardRef<HTMLInputElement, TimePickerFieldProps>(
  // We need to pass the name prop to the TimePicker component
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (
    {
      label,
      id,
      errors,
      name,
      placeholder,
      value,
      onChange,
      defaultValue,
      description,
      warnings,
      required,
      disabled,
      inputProps,
      selectProps,
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
    } = useTimePickerField(value, defaultValue, onChange);
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
          placeholder={placeholder}
          iconName="Clock"
          isOpen={isOpen}
          name={name}
          value={inputValue}
          setIsOpen={setIsOpen}
          onInputChange={handleInputChange}
          ref={ref}
          {...inputProps}
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
          />
        </BasePickerField>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export const TimePickerField =
  withFieldValidation<TimePickerFieldProps>(TimePickerRaw);
TimePickerField.displayName = "TimePickerField";
