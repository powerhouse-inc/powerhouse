import React, { useId } from "react";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { Radio } from "./radio";
import { RadioGroup } from "./radio-group";

export interface RadioOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupFieldProps {
  className?: string;
  defaultValue?: string;
  description?: string;
  warnings?: string[];
  errors?: string[];
  id?: string;
  label?: string;
  name?: string;
  onChange?: (value: string) => void;
  radioOptions: RadioOption[];
  required?: boolean;
  value?: string;
}

export const RadioGroupField: React.FC<RadioGroupFieldProps> = (props) => {
  const {
    className,
    defaultValue,
    description,
    warnings = [],
    errors = [],
    id,
    label,
    name,
    onChange,
    radioOptions = [],
    required = false,
    value,
  } = props;

  const hasLabel = label !== undefined;
  const hasError = errors.length > 0;
  const prefix = useId();

  return (
    <RadioGroup
      aria-invalid={hasError}
      aria-label={!hasLabel ? "Radio group" : undefined}
      aria-required={required}
      className={className}
      defaultValue={defaultValue}
      id={id}
      name={name}
      onValueChange={(newValue) => {
        onChange?.(newValue);
      }}
      value={value}
    >
      {hasLabel && (
        <FormLabel
          description={description}
          hasError={hasError}
          htmlFor={id}
          required={required}
        >
          {label}
        </FormLabel>
      )}
      {radioOptions.map((option, index) => (
        <div
          key={`${prefix}-radio-${index}-${option.value}`}
          className="flex items-center gap-2.5"
          role="presentation"
        >
          <Radio
            id={`${prefix}-radio-${index}-${option.value}`}
            label={option.label}
            value={option.value}
            description={option.description}
            disabled={option.disabled}
            hasError={hasError}
          />
        </div>
      ))}
      {warnings.length > 0 && (
        <FormMessageList messages={warnings} type="warning" />
      )}
      {hasError && <FormMessageList messages={errors} type="error" />}
    </RadioGroup>
  );
};
