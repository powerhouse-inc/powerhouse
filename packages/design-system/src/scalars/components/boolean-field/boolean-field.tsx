import {
  CheckboxField,
  type CheckboxFieldProps,
} from "../fragments/checkbox-field";
import { ToggleField, type ToggleFieldProps } from "../fragments/toggle-field";

export interface BooleanFieldProps extends CheckboxFieldProps {
  isToggle?: boolean;
  toggleProps?: Omit<ToggleFieldProps, keyof CheckboxFieldProps>;
}

export const BooleanField: React.FC<BooleanFieldProps> = ({
  isToggle,
  ...props
}) => {
  const { toggleProps = {}, name, ...checkboxProps } = props;
  return isToggle ? (
    <ToggleField name={name} {...toggleProps} />
  ) : (
    <CheckboxField {...checkboxProps} name={name} />
  );
};
