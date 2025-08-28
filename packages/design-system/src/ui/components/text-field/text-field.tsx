import type {
  FieldErrorHandling,
  WithDifference,
} from "@powerhousedao/design-system/ui";
import type { TextInputProps } from "@powerhousedao/design-system/ui";
import {
  TextInput,
  withFieldValidation,
} from "@powerhousedao/design-system/ui";

export type TextFieldProps = TextInputProps &
  FieldErrorHandling &
  WithDifference<string>;

export const TextField = withFieldValidation<TextFieldProps>(TextInput);

TextField.displayName = "TextField";
