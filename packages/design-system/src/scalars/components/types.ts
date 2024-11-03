export type Maybe<T> = T | undefined;

export interface FieldCommonProps<T> {
  id?: string;
  name: string;
  label?: React.ReactNode;
  description?: string;
  value?: T;
  defaultValue?: T;
  required?: boolean;
  disabled?: boolean;
  errors?: string[];
  warnings?: string[];
  className?: string;
}

export interface ErrorHandling {
  showErrorOnBlur?: boolean;
  showErrorOnChange?: boolean;
  customValidator?: (
    value: any,
    formState: Record<string, any>,
  ) => string | boolean;
}

export interface TextProps {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  placeholder?: string;
  trim?: boolean;
  uppercase?: boolean;
  lowercase?: boolean;
  autoComplete?: boolean;
  spellCheck?: boolean;
}
