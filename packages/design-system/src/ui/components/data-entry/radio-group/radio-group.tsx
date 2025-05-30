import { cn, FormLabel, FormMessageList, type InputBaseProps } from "#scalars";
import React, { useId } from "react";
import { CustomizableRadioGroup } from "./customizable-radio-group.js";
import { Radio } from "./radio.js";

interface RadioGroupBaseProps {
  options?: {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
  }[];
  onChange?: (value: string) => void;
}

type RadioGroupProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  keyof InputBaseProps<string> | keyof RadioGroupBaseProps | "dir"
> &
  InputBaseProps<string> &
  RadioGroupBaseProps & {
    dir?: "ltr" | "rtl";
  };

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
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
      <CustomizableRadioGroup
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
      </CustomizableRadioGroup>
    );
  },
);

RadioGroup.displayName = "RadioGroup";

export { RadioGroup, type RadioGroupBaseProps, type RadioGroupProps };
