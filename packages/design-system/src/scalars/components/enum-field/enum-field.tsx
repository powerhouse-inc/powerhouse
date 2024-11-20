import React from "react";
import { RadioGroupField } from "@/scalars/components/fragments/radio-group-field";
import { SelectField } from "@/scalars/components/fragments/select-field";
import {
  FieldCommonProps,
  ErrorHandling,
  EnumProps,
} from "@/scalars/components/types";

export interface EnumOption {
  icon?: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export type EnumFieldProps = FieldCommonProps<string | string[]> &
  ErrorHandling &
  EnumProps & {
    options?: EnumOption[];
  };

export const EnumField: React.FC<EnumFieldProps> = ({
  variant,
  options = [],
  optionLabels = {},
  disabledOptions = [],
  ...props
}) => {
  // Transform options based on optionLabels if no direct options provided
  const transformedOptions: EnumOption[] =
    options.length > 0
      ? options
      : Object.entries(optionLabels).map(([value, label]) => ({
          value,
          label: label || value,
          disabled: disabledOptions.includes(value),
        }));

  if (variant === "RadioGroup") {
    return (
      <RadioGroupField
        {...props}
        defaultValue={props.defaultValue as string}
        value={props.value as string}
        onChange={props.onChange as (value: string) => void}
        options={transformedOptions}
      />
    );
  }

  return (
    <SelectField
      {...props}
      defaultValue={props.defaultValue as string[]}
      value={props.value as string[]}
      onChange={props.onChange as (value: string | string[]) => void}
      options={transformedOptions}
    />
  );
};

EnumField.displayName = "EnumField";
