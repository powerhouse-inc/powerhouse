import { cn } from "@powerhousedao/design-system";
import type {
  FieldErrorHandling,
  InputBaseProps,
  RadioGroupProps,
} from "@powerhousedao/design-system/ui";
import {
  FormLabel,
  FormMessageList,
  withFieldValidation,
} from "@powerhousedao/design-system/ui";
import * as React from "react";
import { RadioGroup } from "./radio-group.js";
import { Radio } from "./radio.js";

type RadioGroupFieldBaseProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  | keyof InputBaseProps<string>
  | keyof FieldErrorHandling
  | keyof RadioGroupProps
  | "dir"
> & {
  dir?: "ltr" | "rtl";
};

export type RadioGroupFieldProps = RadioGroupFieldBaseProps &
  InputBaseProps<string> &
  FieldErrorHandling &
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
    const prefix = React.useId();
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
