import React, { useId } from "react";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { FieldCommonProps, ErrorHandling } from "@/scalars/components/types";
import { Radio } from "./radio";
import { RadioGroup } from "./radio-group";

export interface RadioOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupFieldProps
  extends FieldCommonProps<string>,
    ErrorHandling {
  options: RadioOption[];
  onChange?: (value: string) => void;
}

const RadioGroupFieldRaw: React.FC<RadioGroupFieldProps> = ({
  autoFocus = false,
  className,
  defaultValue,
  description,
  disabled = false,
  warnings = [],
  errors = [],
  id,
  label,
  name,
  onChange,
  options = [],
  required = false,
  value,
}) => {
  const hasLabel = label !== undefined;
  const hasError = errors.length > 0;
  const prefix = useId();

  return (
    <RadioGroup
      aria-invalid={hasError}
      aria-label={!hasLabel ? "Radio group" : undefined}
      aria-required={required}
      autoFocus={autoFocus}
      className={className}
      defaultValue={defaultValue}
      id={id}
      name={name}
      onValueChange={(newValue) => {
        onChange?.(newValue);
      }}
      value={value}
      disabled={disabled}
    >
      {hasLabel && (
        <FormLabel
          description={description}
          hasError={hasError}
          htmlFor={id}
          required={required}
          disabled={disabled}
        >
          {label}
        </FormLabel>
      )}
      {options.map((option, index) => (
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
            disabled={disabled || option.disabled}
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

export const RadioGroupField =
  withFieldValidation<RadioGroupFieldProps>(RadioGroupFieldRaw);
