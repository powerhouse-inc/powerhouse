import React from "react";
import {
  RadioGroupField,
  type RadioGroupFieldProps,
} from "../radio-group-field/radio-group-field.js";
import {
  SelectField,
  type SelectFieldProps,
} from "../select-field/select-field.js";

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
