import React from "react";
import { InputToggle } from "./input-toggle";
import { cn } from "@/scalars/lib/utils";
import { FormLabel } from "../form-label";
import { FormMessage, FormMessageType } from "../form-message";

export interface Message {
  code: string;
  message: string;
}

interface ToggleProps {
  label?: string;
  disabled?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  type?: FormMessageType;
  message?: string;
  errors?: Message[];
  className?: string;
  required?: boolean;
  name?: string;
}

const Toggle: React.FC<ToggleProps> = ({
  label,
  disabled,
  checked,
  onCheckedChange,
  type,
  errors = [],
  required = false,
  name,
  className,
}) => {
  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      data-testid="custom-class"
    >
      <div className="flex items-center">
        {label && (
          <FormLabel className="mr-2" disabled={disabled} id={name}>
            {label}
          </FormLabel>
        )}
        <InputToggle
          aria-labelledby={name}
          required={required}
          disabled={disabled}
          name="switch"
          id="switch"
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </div>
      {errors.length !== 0 &&
        errors.map((error) => (
          <FormMessage key={error.code} type={type}>
            {error.message}
          </FormMessage>
        ))}
    </div>
  );
};

Toggle.displayName = "Toggle";

export { Toggle };
