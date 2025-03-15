import { cn } from "#scalars";
import React, { useId } from "react";
import { InputBaseProps } from "../../types.js";
import { FormLabel } from "../form-label/index.js";
import { FormMessageList } from "../form-message/index.js";
import { ToggleBase } from "./toggle-base.js";

type ToggleBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  keyof InputBaseProps<boolean> | "onChange"
>;

interface ToggleProps
  extends ToggleBaseProps,
  InputBaseProps<boolean> {
  onChange?: (checked: boolean) => void;
}

const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
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
          <ToggleBase
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

Toggle.displayName = "Toggle";

export { Toggle, type ToggleProps };
