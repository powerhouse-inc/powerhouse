import {
  Textarea,
  type TextareaProps,
} from "../../../../ui/components/data-entry/textarea/textarea.js";
import { type FieldErrorHandling, type WithDifference } from "../../types.js";
import { withFieldValidation } from "../with-field-validation/with-field-validation.js";

export type TextareaFieldProps = TextareaProps &
  FieldErrorHandling &
  WithDifference<string>;

const TextareaField = withFieldValidation<TextareaFieldProps>(Textarea);

TextareaField.displayName = "TextareaField";

export { TextareaField };
