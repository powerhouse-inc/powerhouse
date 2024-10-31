import React, { useId } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { FormLabel } from "@/scalars/components/form-label";
import { cn } from "@/scalars/lib/utils";

export interface RadioProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  className?: string;
  description?: string;
  disabled?: boolean;
  hasError?: boolean;
  id?: string;
  label: string;
  value: string;
}

export const Radio = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioProps
>(
  (
    {
      className,
      description,
      disabled = false,
      hasError = false,
      id: propId,
      label = "",
      value = "",
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = propId ?? `${prefix}-radio`;

    return (
      <>
        <RadioGroupPrimitive.Item
          {...props}
          aria-disabled={disabled}
          aria-invalid={hasError}
          className={cn(
            "aspect-square size-4 rounded-full border-2 border-blue-700",
            "dark:border-blue-400",
            "focus:outline-none focus:ring-2 focus:ring-blue-100 focus:ring-offset-0",
            "dark:focus:ring-blue-900/30",
            "hover:border-blue-900",
            "dark:hover:border-blue-300",
            "focus:hover:ring-blue-200",
            "dark:focus:hover:ring-blue-900/40",
            disabled && [
              "border-gray-600 cursor-not-allowed opacity-50 hover:border-gray-600",
              "dark:border-gray-400 dark:hover:border-gray-400",
            ],
            hasError && [
              "border-red-700 focus:ring-red-100 hover:border-red-900 focus:hover:ring-red-200",
              "dark:border-red-400 dark:focus:ring-red-800 dark:hover:border-red-300 dark:focus:hover:ring-red-700",
            ],
            className,
          )}
          disabled={disabled}
          id={id}
          ref={ref}
          value={value}
        >
          <RadioGroupPrimitive.Indicator
            className={cn(
              "relative flex size-full items-center justify-center",
              "after:block after:size-2 after:rounded-full after:bg-blue-700 after:content-['']",
              "dark:after:bg-blue-400",
              "after:hover:bg-blue-900",
              "dark:after:hover:bg-blue-300",
              disabled && [
                "after:bg-gray-600 after:hover:bg-gray-600",
                "dark:after:bg-gray-400 dark:after:hover:bg-gray-400",
              ],
              hasError && [
                "after:bg-red-700 after:hover:bg-red-900",
                "dark:after:bg-red-400 dark:after:hover:bg-red-300",
              ],
            )}
          />
        </RadioGroupPrimitive.Item>
        <FormLabel
          description={description}
          disabled={disabled}
          hasError={hasError}
          htmlFor={id}
          required={props.required}
        >
          {label}
        </FormLabel>
      </>
    );
  },
);
