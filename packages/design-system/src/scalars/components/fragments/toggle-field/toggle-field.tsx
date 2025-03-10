import { cn } from "#scalars";
import type React from "react";
import { useId } from "react";
import type { FieldCommonProps } from "../../types";
import { FormLabel } from "../form-label";
import { FormMessageList } from "../form-message";
import { withFieldValidation } from "../with-field-validation";
import { Toggle } from "./toggle";

export interface ToggleFieldProps extends FieldCommonProps<boolean> {
  onChange?: (checked: boolean) => void;
}

const ToggleRaw: React.FC<ToggleFieldProps> = ({
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
}) => {
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
};

const ToggleField = withFieldValidation<ToggleFieldProps>(ToggleRaw);

export { ToggleField };
