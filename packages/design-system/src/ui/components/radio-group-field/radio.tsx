import { cn } from "#design-system";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import React, { useId } from "react";
import { FormLabel } from "../form-label/form-label.js";

export interface RadioProps extends React.ComponentPropsWithoutRef<
  typeof RadioGroupPrimitive.Item
> {
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
            "group peer",
            "aspect-square size-4 rounded-full border border-gray-800 dark:border-slate-400",
            "hover:border-gray-900 dark:hover:border-slate-50",
            disabled && [
              "cursor-not-allowed border-gray-600 hover:border-gray-600 dark:border-slate-300 dark:hover:border-slate-300",
              "dark:border-slate-600 dark:hover:border-slate-600",
            ],
            hasError && [
              "border-red-700 hover:border-red-900 dark:border-red-200 dark:hover:border-red-50",
              "dark:border-red-700 dark:hover:border-red-900",
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
              "after:absolute after:top-1/2 after:left-1/2 after:size-2.5",
              "after:-translate-1/2",
              "after:rounded-full after:bg-gray-800 after:content-[''] dark:after:bg-slate-100",
              "dark:after:bg-slate-400",
              !disabled && [
                "group-hover:after:bg-gray-900 dark:group-hover:after:bg-slate-50",
                "dark:group-hover:after:bg-slate-50",
              ],
              disabled && [
                "after:bg-gray-600 dark:after:bg-slate-300",
                "dark:after:bg-slate-600",
              ],
            )}
          />
        </RadioGroupPrimitive.Item>
        <FormLabel
          className={cn(
            !disabled &&
              !hasError && [
                "cursor-pointer",
                "peer-hover:text-gray-900 dark:peer-hover:text-slate-50",
              ],
          )}
          description={description}
          disabled={disabled}
          hasError={hasError}
          htmlFor={id}
          required={props.required}
          inline
        >
          {label}
        </FormLabel>
      </>
    );
  },
);
