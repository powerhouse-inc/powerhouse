import React, { useId } from "react";
import { cn } from "@/scalars/lib/utils";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import {
  FieldCommonProps,
  ErrorHandling,
  RadioGroupProps,
} from "@/scalars/components/types";
import { Radio } from "./radio";
import { RadioGroup } from "./radio-group";

export interface RadioGroupFieldProps
  extends FieldCommonProps<string>,
    ErrorHandling,
    RadioGroupProps {}

const RadioGroupFieldRaw = React.forwardRef<
  HTMLDivElement,
  RadioGroupFieldProps
>(
  (
    {
      autoFocus = false,
      className,
      defaultValue,
      description,
      disabled = false,
      warnings = [],
      errors = [],
      id: propId,
      label,
      name,
      onChange,
      options = [],
      required = false,
      value,
      ...props
    },
    ref,
  ) => {
    const hasLabel = label !== undefined;
    const hasError = errors.length > 0;
    const prefix = useId();
    const id = propId ?? `${prefix}-radio-group`;

    return (
      <RadioGroup
        aria-invalid={hasError}
        aria-label={!hasLabel ? "Radio group" : undefined}
        aria-required={required}
        autoFocus={autoFocus}
        className={cn("flex flex-col gap-2", className)}
        defaultValue={defaultValue}
        id={id}
        name={name}
        onValueChange={(newValue) => {
          onChange?.(newValue);
        }}
        value={value}
        disabled={disabled}
        {...props}
        ref={ref}
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
            className="flex items-center gap-2"
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
  },
);

export const RadioGroupField = withFieldValidation<RadioGroupFieldProps>(
  RadioGroupFieldRaw,
) as React.ForwardRefExoticComponent<
  RadioGroupFieldProps & React.RefAttributes<HTMLDivElement>
>;

RadioGroupField.displayName = "RadioGroupField";
