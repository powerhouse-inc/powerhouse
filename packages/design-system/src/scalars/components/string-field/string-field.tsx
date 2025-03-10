import {
  TextField,
  type TextFieldProps,
} from "../fragments/text-field/index.js";
import {
  TextareaField,
  type TextareaProps,
} from "../fragments/textarea-field/index.js";

export interface StringFieldProps
  extends Omit<TextFieldProps, keyof TextareaProps>,
    TextareaProps {}

export const StringField: React.FC<StringFieldProps> = ({
  autoExpand,
  multiline,
  ...props
}) => {
  if (autoExpand || multiline) {
    // only textarea supports autoExpand and multiline
    return (
      <TextareaField autoExpand={autoExpand} multiline={multiline} {...props} />
    );
  }

  return <TextField {...(props as TextFieldProps)} />;
};
