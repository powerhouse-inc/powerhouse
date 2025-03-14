import { cn } from "#scalars";
import React, { useId } from "react";
import type { FieldCommonProps } from "../../types.js";
import { FormLabel } from "../form-label/index.js";
import { FormMessageList } from "../form-message/index.js";
import { withFieldValidation } from "../with-field-validation/index.js";
import { Checkbox, CheckboxValue } from "./checkbox.js";

type CheckboxFieldBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  keyof FieldCommonProps<CheckboxValue> | "onChange"
>;

export interface CheckboxFieldProps
  extends CheckboxFieldBaseProps,
    FieldCommonProps<CheckboxValue> {
  onChange?: (checked: CheckboxValue) => void;
}

const CheckboxRaw = React.forwardRef<HTMLButtonElement, CheckboxFieldProps>(
  (
    {
      id: idProp,
      name,
      label,
      value,
      defaultValue,
      disabled,
      required,
      description,
      errors,
      warnings,
      onChange,
      className,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;
    const hasError = !!errors?.length;

    const castValue = (value: unknown) => {
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    };

    return (
      <div className={cn("flex flex-col gap-2")}>
        <div className={cn("group flex items-center space-x-2", className)}>
          <Checkbox
            id={id}
            name={name}
            checked={castValue(value ?? defaultValue) as CheckboxValue}
            disabled={disabled}
            onCheckedChange={onChange}
            required={required}
            invalid={hasError}
            aria-invalid={hasError}
            ref={ref}
            {...props}
          />
          <FormLabel
            htmlFor={id}
            required={required}
            disabled={disabled}
            hasError={hasError}
            description={description}
            className={cn(!disabled && "group-hover:cursor-pointer")}
            inline
          >
            {label}
          </FormLabel>
        </div>
        {warnings && <FormMessageList type="warning" messages={warnings} />}
        {errors && <FormMessageList type="error" messages={errors} />}
      </div>
    );
  },
);

export const CheckboxField =
  withFieldValidation<CheckboxFieldProps>(CheckboxRaw);

CheckboxField.displayName = "CheckboxField";
