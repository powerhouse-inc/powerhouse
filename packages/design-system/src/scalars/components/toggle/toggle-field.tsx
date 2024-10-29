import React, { useId } from "react";
import { Toggle } from "./toggle";
import { cn } from "@/scalars/lib/utils";
import { FormLabel } from "../form-label";
import { FormMessageList } from "../form-message";

interface ToggleFieldProps {
  label?: string;
  disabled?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  errors?: string[];
  className?: string;
  required?: boolean;
  name?: string;
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
}) => {
  const id = useId();

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
          checked={checked}
          onCheckedChange={onCheckedChange}
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
      {errors.length !== 0 && (
        <FormMessageList messages={errors} type="error" />
      )}
    </div>
  );
};

export { ToggleField };
