import {
  MultiSelect,
  type Option,
  type SelectProps,
} from "react-multi-select-component";
import { twMerge } from "tailwind-merge";
import { SettingsRow, type SettingsRowProps } from "./row";

export interface DocumentSelectSettingsRowProps
  extends Omit<SettingsRowProps, "onChange"> {
  options: Option[];
  selected?: Option[];
  onChange: (options: Option[]) => void;
  selectProps?: Partial<SelectProps>;
}

export const DocumentSelectSettingsRow: React.FC<
  DocumentSelectSettingsRowProps
> = (props) => {
  const {
    options,
    onChange,
    className,
    selected = [],
    selectProps = {},
    ...restProps
  } = props;

  return (
    <SettingsRow {...restProps}>
      <MultiSelect
        className={twMerge("checkbox-container w-[200px]", className)}
        labelledBy="Select"
        onChange={onChange}
        options={options}
        value={selected}
        {...selectProps}
      />
    </SettingsRow>
  );
};
