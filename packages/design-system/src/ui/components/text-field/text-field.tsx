import type { FieldErrorHandling, WithDifference } from "../../types.js";
import type { TextInputProps } from "../text-input/text-input.js";
import { TextInput } from "../text-input/text-input.js";
import { withFieldValidation } from "../with-field-validation/index.js";

export type TextFieldProps = TextInputProps &
  FieldErrorHandling &
  WithDifference<string>;

export const TextField = withFieldValidation<TextFieldProps>(TextInput);

TextField.displayName = "TextField";
