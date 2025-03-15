import { type FieldErrorHandling } from "../../types.js";
import { withFieldValidation } from "../with-field-validation/with-field-validation.js";
import { Textarea, type TextareaProps } from "./textarea.js";

interface TextareaFieldProps extends TextareaProps, FieldErrorHandling {}

const TextareaField = withFieldValidation<TextareaFieldProps>(Textarea);

TextareaField.displayName = "TextareaField";

export { TextareaField, type TextareaFieldProps };
