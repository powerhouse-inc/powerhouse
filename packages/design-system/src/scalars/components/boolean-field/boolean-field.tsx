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

export const BooleanField: React.FC<BooleanFieldProps> = ({
  isToggle,
  onChange,
  ...props
}) => {
  const handleChange = (value: string | boolean) => {
    onChange?.(Boolean(value));
  };

  return isToggle ? (
    <ToggleField {...props} onChange={handleChange} />
  ) : (
    <CheckboxField {...props} onChange={handleChange} />
  );
};
