import React, { useId } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { FormLabel } from "@/scalars/components/fragments/form-label";
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
      label,
      value,
      ...props
    },
    ref,
  ) => {
    const prefix = useId();
    const id = propId ?? `${prefix}-radio`;

    return (
      <>
        <RadioGroupPrimitive.Item
          aria-disabled={disabled}
          aria-invalid={hasError}
          className={cn(
            "group/radio peer/radio",
            "aspect-square size-4 rounded-full border border-gray-800 dark:border-gray-400",
            "hover:border-gray-900 dark:hover:border-gray-50",
            "focus:outline-none focus:ring-1 focus:ring-gray-300/40 focus:ring-offset-0",
            "dark:focus:ring-gray-500/40",
            "focus:hover:ring-gray-400/40 dark:focus:hover:ring-gray-400/40",
            disabled && [
              "cursor-not-allowed border-gray-600 hover:border-gray-600",
              "dark:border-gray-600 dark:hover:border-gray-600",
            ],
            hasError && [
              "border-red-700 hover:border-red-900 focus:ring-transparent focus:hover:ring-transparent",
              "dark:border-red-700 dark:hover:border-red-900 dark:focus:ring-transparent dark:focus:hover:ring-transparent",
            ],
            className,
          )}
          disabled={disabled}
          id={id}
          value={value}
          {...props}
          ref={ref}
        >
          <RadioGroupPrimitive.Indicator
            className={cn(
              "relative flex size-full items-center justify-center",
              "after:absolute after:left-1/2 after:top-1/2 after:size-2.5",
              "after:-translate-x-1/2 after:-translate-y-1/2",
              "after:rounded-full after:bg-gray-800 after:content-['']",
              "dark:after:bg-gray-400",
              !disabled && [
                "group-hover/radio:after:bg-gray-900",
                "dark:group-hover/radio:after:bg-gray-50",
              ],
              disabled && ["after:bg-gray-600", "dark:after:bg-gray-600"],
            )}
          />
        </RadioGroupPrimitive.Item>
        <FormLabel
          className={cn(
            !disabled &&
              !hasError && [
                "cursor-pointer",
                "text-gray-800 dark:text-gray-400",
                "peer-hover/radio:text-gray-900 dark:peer-hover/radio:text-gray-50",
              ],
          )}
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