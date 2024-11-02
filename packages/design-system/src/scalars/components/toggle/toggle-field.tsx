import React, { useId, useState } from "react";
import { Toggle } from "./toggle";
import { cn } from "@/scalars/lib/utils";
import { FormLabel } from "../fragments/form-label";
import { FormMessageList } from "../fragments/form-message";
import { validateRequiredField } from "./toggles-schema";

interface ToggleFieldProps {
  label?: string;
  disabled?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onBlur?: () => void;
  errors?: string[];
  className?: string;
  required?: boolean;
  name?: string;
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
}

const ToggleField: React.FC<ToggleFieldProps> = ({
  label,
  disabled = false,
  checked = true,
  onCheckedChange,
  errors = [],
  required = false,
  name,
  className,
  validateOnBlur = true,
  validateOnChange = false,
  onBlur,
}) => {
  const id = useId();
  const [touched, setTouched] = useState(false);

  const validateField = () => {
    return [...errors, ...validateRequiredField(checked, required)];
  };

  const errorMerge = validateField();
  const showError = touched && !!errorMerge.length;

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
          onBlur={() => {
            if (validateOnBlur) {
              setTouched(true);
              onBlur?.();
            }
          }}
          onCheckedChange={(checked) => {
            if (validateOnChange) {
              setTouched(true);
            }
            onCheckedChange?.(checked);
          }}
          id={id}
          checked={checked}
        />
        {label && (
          <FormLabel
            htmlFor={id}
            className="ml-2"
            disabled={disabled}
            id={`${id}-label`}
          >
            {label}
          </FormLabel>
        )}
      </div>
      {showError && <FormMessageList messages={errorMerge} type="error" />}
    </div>
  );
};

export { ToggleField };
