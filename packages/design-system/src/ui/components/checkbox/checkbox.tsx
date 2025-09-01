import type { InputBaseProps } from "@powerhousedao/design-system";
import { cn, FormLabel, FormMessageList } from "@powerhousedao/design-system";
import React, { useId } from "react";
import type { CheckboxValue } from "./checkbox-base.js";
import { CheckboxBase } from "./checkbox-base.js";

type CheckboxBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  keyof InputBaseProps<CheckboxValue> | "onChange"
>;

export interface CheckboxProps
  extends CheckboxBaseProps,
    InputBaseProps<CheckboxValue> {
  onChange?: ((checked: CheckboxValue) => void) | ((checked: boolean) => void);
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
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
          <CheckboxBase
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

Checkbox.displayName = "Checkbox";

export { Checkbox };
