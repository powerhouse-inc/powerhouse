import { TextField, type TextFieldProps } from "../fragments/text-field";
import { TextareaField, TextareaProps } from "../fragments/textarea-field";

export interface StringFieldProps
  extends Omit<TextFieldProps, keyof TextareaProps>,
    TextareaProps {
  multiline?: boolean;
  autoExpand?: boolean;
}

const StringField: React.FC<StringFieldProps> = ({
  multiline,
  autoExpand,
  ...props
}) => {
  if (multiline || autoExpand) {
    // only textarea supports multiline and autoExpand
    return <TextareaField {...props} />;
  }

  return <TextField {...(props as TextFieldProps)} />;
};

export { StringField };
