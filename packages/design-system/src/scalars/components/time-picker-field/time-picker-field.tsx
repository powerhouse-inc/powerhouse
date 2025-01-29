import React, { forwardRef } from "react";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
} from "../fragments";
import { FieldCommonProps } from "../types";
import { TimeFieldValue } from "./type";
import { BasePickerField } from "../date-time-field/base-picker-field";

interface TimePickerFieldProps extends FieldCommonProps<TimeFieldValue> {
  label?: string;
  id?: string;
  name: string;
  value?: TimeFieldValue;
  defaultValue?: TimeFieldValue;
  placeholder?: string;
}

const TimePickerField = forwardRef<HTMLInputElement, TimePickerFieldProps>(
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
      defaultValue,
      description,
      warnings,
      ...props
    },
    ref,
  ) => {
    const [inputValue, setInputValue] = React.useState(
      value ?? defaultValue ?? "",
    );
    const [isOpen, setIsOpen] = React.useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={props.required}
            disabled={props.disabled}
            hasError={!!errors?.length}
          >
            {label}
          </FormLabel>
        )}
        <BasePickerField
          name={name}
          placeholder={placeholder}
          iconName="Clock"
          isOpen={isOpen}
          value={inputValue}
          setIsOpen={setIsOpen}
          onInputChange={handleInputChange}
          ref={ref}
          {...props}
        >
          <div>Placeholder TimePicker</div>
        </BasePickerField>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export default TimePickerField;
