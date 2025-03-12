import React from "react";
import {
  CheckboxField,
  type CheckboxFieldProps,
} from "../fragments/checkbox-field";
import { ToggleField, type ToggleFieldProps } from "../fragments/toggle-field";

export interface BooleanFieldProps
  extends Omit<CheckboxFieldProps, "defaultValue" | "onChange" | "value">,
    Omit<ToggleFieldProps, "onChange" | "value"> {
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
