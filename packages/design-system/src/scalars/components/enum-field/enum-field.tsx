import React from "react";
import { RadioGroupField } from "@/scalars/components/fragments/radio-group-field";
import { SelectField } from "@/scalars/components/fragments/select-field";
import { FieldCommonProps, ErrorHandling } from "@/scalars/components/types";
import { EnumProps } from "./types";

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
