import React from "react";
import {
  RadioGroupField,
  RadioGroupFieldProps,
} from "@/scalars/components/fragments/radio-group-field";
import {
  SelectField,
  SelectFieldProps,
} from "@/scalars/components/fragments/select-field";

export type EnumFieldProps =
  | ({
      variant?: "auto";
    } & (RadioGroupFieldProps | SelectFieldProps))
  | ({
      variant: "RadioGroup";
    } & RadioGroupFieldProps)
  | ({
      variant: "Select";
    } & SelectFieldProps);

export const EnumField = React.forwardRef<
  HTMLDivElement | HTMLButtonElement,
  EnumFieldProps
>(({ variant = "auto", options = [], ...props }, ref) => {
  const radio = (
    <RadioGroupField
      options={options}
      {...(props as RadioGroupFieldProps)}
      ref={ref as React.ForwardedRef<HTMLDivElement>}
    />
  );
  const select = (
    <SelectField
      options={options}
      {...(props as SelectFieldProps)}
      ref={ref as React.ForwardedRef<HTMLButtonElement>}
    />
  );

  switch (variant) {
    case "RadioGroup":
      return radio;
    case "Select":
      return select;
    case "auto":
      return options.length < 6 ? radio : select;
  }
});

EnumField.displayName = "EnumField";
