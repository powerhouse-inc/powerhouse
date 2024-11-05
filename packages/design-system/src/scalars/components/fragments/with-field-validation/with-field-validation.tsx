import React from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { FieldCommonProps, ErrorHandling } from "../../types";

interface PossibleProps extends FieldCommonProps<any>, ErrorHandling {
  pattern?: RegExp;
  maxLength?: number;
  minLength?: number;
}

export const withFieldValidation = <T extends PossibleProps>(
  Component: React.ComponentType<T>,
) => {
  return ({ ...props }: T) => {
    const {
      control,
      formState: { errors: formErrors },
    } = useFormContext();

    const errors = [
      ...(props.errors ?? []),
      ...(formErrors[props.name]?.message
        ? [formErrors[props.name]?.message]
        : []),
    ];

    return (
      <Controller
        control={control}
        name={props.name}
        defaultValue={props.defaultValue as unknown}
        disabled={props.disabled}
        render={({ field }) => (
          <Component {...field} {...props} errors={errors} />
        )}
        rules={{
          ...(props.required && {
            required: {
              value: props.required,
              message: "This field is required",
            },
          }),
          ...(props.pattern && {
            pattern: {
              value: props.pattern,
              message: "This field does not match the required pattern",
            },
          }),
          ...(props.maxLength && {
            maxLength: {
              value: props.maxLength,
              message: `This field must be less than ${props.maxLength} characters`,
            },
          }),
          ...(props.minLength && {
            minLength: {
              value: props.minLength,
              message: `This field must be more than ${props.minLength} characters`,
            },
          }),
          ...(props.customValidator && {
            validate: {
              customValidator: props.customValidator,
            },
          }),
        }}
      />
    );
  };
};
