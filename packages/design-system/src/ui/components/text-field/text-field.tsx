import type {
  FieldErrorHandling,
  TextInputProps,
  WithDifference,
} from "@powerhousedao/design-system";
import { TextInput, withFieldValidation } from "@powerhousedao/design-system";
import { forwardRef, type Ref } from "react";

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
