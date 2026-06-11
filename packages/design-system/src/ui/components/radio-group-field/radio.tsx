import { twMerge } from "tailwind-merge";
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
          className={twMerge(
            "group peer",
            "aspect-square size-4 rounded-full border border-gray-900 dark:border-slate-50",
            "hover:effect",
            disabled && [
              "cursor-not-allowed border-gray-300 dark:border-slate-500",
              "dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100",
            ],
            hasError && [
              "border-red-900 dark:border-red-100",
              "dark:border-red-900",
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
            className={twMerge(
              "relative flex size-full items-center justify-center",
              "after:absolute after:top-1/2 after:left-1/2 after:size-2.5",
              "after:-translate-1/2",
              "after:rounded-full after:bg-gray-800 after:content-[''] dark:after:bg-slate-100",
              "dark:after:bg-slate-400",
              !disabled && [
                "group-hover:after:effect dark:group-hover:after:effect",
                "dark:group-hover:after:effect",
              ],
              disabled && [
                "after:bg-gray-500 dark:after:bg-slate-300",
                "dark:after:bg-slate-600 dark:after:text-slate-100",
              ],
            )}
          />
        </RadioGroupPrimitive.Item>
        <FormLabel
          className={twMerge(
            !disabled &&
              !hasError && [
                "cursor-pointer",
                "peer-hover:effect dark:peer-hover:effect",
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
