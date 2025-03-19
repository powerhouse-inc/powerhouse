import type { FieldErrorHandling } from "../../types.js";
import { withFieldValidation } from "../with-field-validation/index.js";
import { TextInput, type TextInputProps } from "./text-input.js";

export type TextFieldProps = TextInputProps & FieldErrorHandling;

export const TextField = withFieldValidation<TextFieldProps>(TextInput);

TextField.displayName = "TextField";
