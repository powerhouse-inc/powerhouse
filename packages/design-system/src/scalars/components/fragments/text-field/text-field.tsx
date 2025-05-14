import {
  TextInput,
  type TextInputProps,
} from "../../../../ui/components/data-entry/text-input/text-input.js";
import type { FieldErrorHandling, WithDifference } from "../../types.js";
import { withFieldValidation } from "../with-field-validation/index.js";

export type TextFieldProps = TextInputProps &
  FieldErrorHandling &
  WithDifference<string>;

export const TextField = withFieldValidation<TextFieldProps>(TextInput);

TextField.displayName = "TextField";
