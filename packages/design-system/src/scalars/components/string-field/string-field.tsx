import { TextField, type TextFieldProps } from "../fragments/text-field";
import { TextareaField, type TextareaProps } from "../fragments/textarea-field";

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
