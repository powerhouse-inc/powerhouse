import {
  CheckboxField,
  type CheckboxFieldProps,
} from "../fragments/checkbox-field";
import { ToggleField, type ToggleFieldProps } from "../fragments/toggle-field";

export interface BooleanFieldProps
  extends CheckboxFieldProps,
    ToggleFieldProps {
  isToggle?: boolean;
}

export const BooleanField: React.FC<BooleanFieldProps> = ({
  isToggle,
  ...props
}) => {
  return isToggle ? <ToggleField {...props} /> : <CheckboxField {...props} />;
};
