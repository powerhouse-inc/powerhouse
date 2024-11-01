import type { FieldCommonProps, TextProps, ErrorHandling } from "../../types";

export interface TextareaProps
  extends Omit<
    FieldCommonProps<string> &
      TextProps &
      ErrorHandling &
      React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "spellCheck"
  > {
  value?: string;
  spellCheck?: boolean;
}

export const TextareaField: React.FC<TextareaProps> = ({ ...props }) => {
  return <textarea {...props} />;
};
