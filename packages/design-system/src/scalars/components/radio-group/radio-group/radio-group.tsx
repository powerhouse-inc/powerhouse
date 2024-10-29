import React, { useId } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { FormLabel } from "@/scalars/components/form-label";
import { FormMessageList } from "@/scalars/components/form-message";
import { cn } from "@/scalars/lib/utils";

export interface RadioGroupProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  children: React.ReactElement | React.ReactElement[];
  className?: string;
  defaultValue?: string;
  description?: string;
  errors?: string[];
  id?: string;
  label?: string;
  name?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  value?: string;
}

export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(
  (
    {
      children,
      className,
      defaultValue,
      description,
      errors = [],
      id: propId,
      label,
      name: propName,
      onValueChange,
      required = false,
      value,
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = propId ?? `${prefix}-radio-group`;
    const name = propName ?? `${prefix}-radio-group`;
    const hasLabel = label !== undefined;
    const hasError = errors.length > 0;

    return (
      <RadioGroupPrimitive.Root
        {...props}
        aria-invalid={hasError}
        aria-label={hasLabel ? undefined : props["aria-label"]}
        aria-required={required}
        className={cn("flex flex-col gap-2.5", className)}
        defaultValue={defaultValue}
        id={id}
        name={name}
        onValueChange={onValueChange}
        ref={ref}
        required={required}
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
        {children}
        {errors.length > 0 && (
          <FormMessageList messages={errors} type="error" />
        )}
      </RadioGroupPrimitive.Root>
    );
  },
);
