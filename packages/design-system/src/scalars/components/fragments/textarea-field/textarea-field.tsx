import {
  Textarea,
  type TextareaProps,
} from "../../../../ui/components/data-entry/textarea/textarea.js";
import { type FieldErrorHandling } from "../../types.js";
import { withFieldValidation } from "../with-field-validation/with-field-validation.js";

interface TextareaFieldProps extends TextareaProps, FieldErrorHandling {}

const TextareaField = withFieldValidation<TextareaFieldProps>(Textarea);

TextareaField.displayName = "TextareaField";

export { TextareaField, type TextareaFieldProps };
