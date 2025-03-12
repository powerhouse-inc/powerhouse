import React, { useId } from "react";
import { Toggle } from "./toggle";
import { cn } from "@/scalars/lib/utils";
import { FormLabel } from "../form-label";
import { FormMessageList } from "../form-message";
import type { FieldCommonProps } from "../../types";
import { withFieldValidation } from "../with-field-validation";

type ToggleFieldBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  keyof FieldCommonProps<boolean> | "onChange"
>;

export interface ToggleFieldProps
  extends ToggleFieldBaseProps,
    FieldCommonProps<boolean> {
  onChange?: (checked: boolean) => void;
}

const ToggleRaw = React.forwardRef<HTMLButtonElement, ToggleFieldProps>(
  (
    {
      id: idProp,
      name,
      label,
      disabled = false,
      value,
      onChange,
      errors = [],
      warnings = [],
      required = false,
      className,
      defaultValue,
      description,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;

    return (
      <div
        className={cn("flex flex-col gap-1", className)}
        data-testid="custom-class"
      >
        <div className="flex items-center">
          <Toggle
            aria-labelledby={`${id}-label`}
            required={required}
            disabled={disabled}
            name={name}
            id={id}
            checked={value ?? defaultValue}
            onCheckedChange={onChange}
            ref={ref}
            {...props}
          />
          {label && (
            <FormLabel
              htmlFor={id}
              className="ml-2"
              disabled={disabled}
              required={required}
              description={description}
              inline
              id={`${id}-label`}
            >
              {label}
            </FormLabel>
          )}
        </div>
        {warnings.length !== 0 && (
          <FormMessageList messages={warnings} type="warning" />
        )}
        {errors.length !== 0 && (
          <FormMessageList messages={errors} type="error" />
        )}
      </div>
    );
  },
);

export const ToggleField = withFieldValidation<ToggleFieldProps>(ToggleRaw);

ToggleField.displayName = "ToggleField";
