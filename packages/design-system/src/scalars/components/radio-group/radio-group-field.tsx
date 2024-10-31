import React, { useId } from "react";
import { FormLabel } from "@/scalars/components/form-label";
import { FormMessageList } from "@/scalars/components/form-message";
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
  errors?: string[];
  id?: string;
  label?: string;
  name?: string;
  onChange?: (value: string) => void;
  radioOptions: RadioOption[];
  required?: boolean;
  value?: string;
}

export const RadioGroupField: React.FC<RadioGroupFieldProps> = ({
  className,
  defaultValue,
  description,
  errors = [],
  id,
  label,
  name,
  onChange,
  radioOptions = [],
  required = false,
  value,
}) => {
  const prefix = useId();
  const hasLabel = label !== undefined;
  const hasError = errors.length > 0;

  return (
    <RadioGroup
      aria-invalid={hasError}
      aria-required={required}
      aria-label={!hasLabel ? "Radio group" : undefined}
      className={className}
      defaultValue={defaultValue}
      id={id}
      name={name}
      onValueChange={onChange}
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
      {hasError && <FormMessageList messages={errors} type="error" />}
    </RadioGroup>
  );
};
