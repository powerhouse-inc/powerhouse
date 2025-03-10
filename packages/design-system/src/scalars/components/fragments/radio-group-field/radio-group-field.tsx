import React, { useId } from "react";
import { cn } from "@/scalars/lib/utils";
import { FormLabel } from "@/scalars/components/fragments/form-label";
import { FormMessageList } from "@/scalars/components/fragments/form-message";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import type {
  FieldCommonProps,
  ErrorHandling,
} from "@/scalars/components/types";
import type { RadioGroupProps } from "@/scalars/components/enum-field/types";
import { Radio } from "./radio";
import { RadioGroup } from "./radio-group";

type RadioGroupFieldBaseProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  | keyof FieldCommonProps<string>
  | keyof ErrorHandling
  | keyof RadioGroupProps
  | "dir"
> & {
  dir?: "ltr" | "rtl";
};

export type RadioGroupFieldProps = RadioGroupFieldBaseProps &
  FieldCommonProps<string> &
  ErrorHandling &
  RadioGroupProps;

const RadioGroupFieldRaw = React.forwardRef<
  HTMLDivElement,
  RadioGroupFieldProps
>(
  (
    {
      autoFocus,
      className,
      defaultValue,
      description,
      disabled,
      warnings = [],
      errors = [],
      id: propId,
      label,
      name,
      onChange,
      options = [],
      required,
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

export const RadioGroupField =
  withFieldValidation<RadioGroupFieldProps>(RadioGroupFieldRaw);

RadioGroupField.displayName = "RadioGroupField";
