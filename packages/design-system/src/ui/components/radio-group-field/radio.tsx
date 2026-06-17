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
            "aspect-square size-4 rounded-full border border-foreground",
            "hover:hover-effect",
            disabled && ["cursor-not-allowed border-border", ""],
            hasError && ["border-destructive", ""],
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
              "after:rounded-full after:bg-primary after:content-['']",
              "",
              !disabled && [
                "group-hover:after:hover-effect dark:group-hover:after:hover-effect",
                "dark:group-hover:after:hover-effect",
              ],
              disabled && ["after:bg-muted-foreground", ""],
            )}
          />
        </RadioGroupPrimitive.Item>
        <FormLabel
          className={twMerge(
            !disabled &&
              !hasError && [
                "cursor-pointer",
                "peer-hover:hover-effect dark:peer-hover:hover-effect",
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
