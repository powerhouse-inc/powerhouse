import React from "react";
import type { CheckboxProps } from "../../../ui/components/data-entry/checkbox/checkbox.js";
import type { ToggleProps } from "../../../ui/components/data-entry/toggle/toggle.js";
import { CheckboxField } from "../fragments/checkbox-field/index.js";
import { ToggleField } from "../fragments/toggle-field/index.js";
export interface BooleanFieldProps
  extends Omit<CheckboxProps, "defaultValue" | "onChange" | "value">,
    Omit<ToggleProps, "onChange" | "value"> {
  isToggle?: boolean;
  onChange?: (value: boolean) => void;
  value?: boolean;
}

export const BooleanField = React.forwardRef<
  HTMLButtonElement,
  BooleanFieldProps
>(({ isToggle, onChange, ...props }, ref) => {
  const handleChange = (value: string | boolean) => {
    onChange?.(Boolean(value));
  };

  return isToggle ? (
    <ToggleField onChange={handleChange} ref={ref} {...props} />
  ) : (
    <CheckboxField onChange={handleChange} ref={ref} {...props} />
  );
});

BooleanField.displayName = "BooleanField";
