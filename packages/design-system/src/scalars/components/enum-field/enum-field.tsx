import React from "react";
import { RadioGroupField } from "@/scalars/components/fragments/radio-group-field";
import { SelectField } from "@/scalars/components/fragments/select-field";
import {
  FieldCommonProps,
  ErrorHandling,
  EnumProps,
} from "@/scalars/components/types";

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
  variant = "Auto",
  options = [],
  ...props
}) => {
  if (variant === "Auto") {
    return options.length < 6 ? (
      <RadioGroupField options={options} {...(props as RadioGroupVariant)} />
    ) : (
      <SelectField options={options} {...(props as SelectVariant)} />
    );
  }

  if (variant === "RadioGroup") {
    return (
      <RadioGroupField options={options} {...(props as RadioGroupVariant)} />
    );
  }

  return <SelectField options={options} {...(props as SelectVariant)} />;
};

EnumField.displayName = "EnumField";
