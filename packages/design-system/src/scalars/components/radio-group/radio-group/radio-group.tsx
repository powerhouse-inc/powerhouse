import React, { useId } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { FormLabel } from "@/scalars/components/form-label";
import { cn } from "@/scalars/lib/utils";

export interface RadioGroupProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  "aria-label"?: string;
  children: React.ReactElement;
  className?: string;
  defaultValue?: string;
  description?: string;
  hasError?: boolean;
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
      "aria-label": ariaLabel,
      children,
      className,
      defaultValue,
      description,
      hasError,
      id: propId,
      label,
      name: propName,
      onValueChange,
      required,
      value,
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = propId ?? `${prefix}-radio-group`;
    const name = propName ?? `${prefix}-radio-group`;
    const hasLabel = label !== undefined;

    return (
      <>
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
        <RadioGroupPrimitive.Root
          {...props}
          aria-invalid={hasError}
          aria-label={hasLabel ? undefined : ariaLabel}
          className={cn("flex flex-col gap-4", className)}
          defaultValue={defaultValue}
          id={id}
          name={name}
          onValueChange={onValueChange}
          ref={ref}
          required={required}
          value={value}
        >
          {children}
        </RadioGroupPrimitive.Root>
      </>
    );
  },
);
