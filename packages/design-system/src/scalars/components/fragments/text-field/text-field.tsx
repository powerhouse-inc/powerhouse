import {
  TextInput,
  type TextInputProps,
} from "../../../../ui/components/data-entry/text-input/text-input.js";
import type { FieldErrorHandling } from "../../types.js";
import { withFieldValidation } from "../with-field-validation/index.js";

export type TextFieldProps = TextInputProps & FieldErrorHandling;

export const TextField = withFieldValidation<TextFieldProps>(TextInput);

TextField.displayName = "TextField";
