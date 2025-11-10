import type { Ref } from "react";
import { forwardRef } from "react";
import type { FieldErrorHandling, WithDifference } from "../../types.js";
import { type TextInputProps, TextInput } from "../text-input/text-input.js";
import { withFieldValidation } from "../with-field-validation/with-field-validation.js";

export type TextFieldProps = TextInputProps &
  FieldErrorHandling &
  WithDifference<string>;

export const TextField = forwardRef(function TextField(
  props: TextFieldProps,
  ref: Ref<HTMLInputElement>,
) {
  const Component = withFieldValidation<TextFieldProps>(TextInput);
  return <Component {...props} ref={ref} />;
});

TextField.displayName = "TextField";
