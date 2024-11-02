import React, { useId, useState } from "react";
import { Toggle } from "./toggle";
import { cn } from "@/scalars/lib/utils";
import { FormLabel } from "../form-label";
import { FormMessageList } from "../form-message";
import type { FieldCommonProps } from "../../types";
import { validateRequiredField } from "./schema";

export interface ToggleFieldProps extends FieldCommonProps<boolean> {
  onChange?: (checked: boolean) => void;
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
}

const ToggleField: React.FC<ToggleFieldProps> = ({
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
  defaultValue = true,
  description,
  validateOnBlur,
  validateOnChange,
}) => {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const [touched, setTouched] = useState(false);

  const validateField = () => {
    return [
      ...errors,
      ...validateRequiredField(value ?? defaultValue, required),
    ];
  };

  const errorMerge = validateField();
  const showError = touched && !!errorMerge.length;
  const showWarning = touched && !!warnings.length;

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
          onBlur={() => {
            if (validateOnBlur) {
              setTouched(true);
            }
          }}
          onCheckedChange={(checked) => {
            if (validateOnChange) {
              setTouched(true);
            }
            onChange?.(checked);
          }}
        />
        {label && (
          <FormLabel
            htmlFor={id}
            className="ml-2"
            disabled={disabled}
            required={required}
            description={description}
            id={`${id}-label`}
          >
            {label}
          </FormLabel>
        )}
      </div>
      {showWarning && <FormMessageList messages={warnings} type="warning" />}
      {showError && <FormMessageList messages={errors} type="error" />}
    </div>
  );
};

export { ToggleField };
