import {
  RadioGroupField,
  SelectField,
  type ErrorHandling,
  type FieldCommonProps,
} from "#scalars";

import { type EnumProps } from "./types.js";

export type EnumFieldProps = FieldCommonProps<string | string[]> &
  ErrorHandling &
  EnumProps;

type RadioGroupVariant = Omit<
  EnumFieldProps,
  "defaultValue" | "value" | "onChange"
> & {
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
};

type SelectVariant = Omit<
  EnumFieldProps,
  "defaultValue" | "value" | "onChange"
> & {
  defaultValue?: string[];
  value?: string[];
  onChange?: (value: string | string[]) => void;
};

export const EnumField: React.FC<EnumFieldProps> = ({
  variant = "auto",
  options = [],
  ...props
}) => {
  const radio = (
    <RadioGroupField options={options} {...(props as RadioGroupVariant)} />
  );
  const select = (
    <SelectField options={options} {...(props as SelectVariant)} />
  );

  switch (variant) {
    case "RadioGroup":
      return radio;
    case "Select":
      return select;
    case "auto":
      return options.length < 6 ? radio : select;
  }
};

EnumField.displayName = "EnumField";
