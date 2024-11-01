export type Maybe<T> = T | null | undefined;

export interface FieldCommonProps<T> {
  label?: string;
  description?: string;
  value?: Maybe<T>;
  default?: Maybe<T>;
  required?: boolean;
  disabled?: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface ErrorHandling {
  showErrorOnBlur?: boolean;
  showErrorOnChange?: boolean;
  customValidator?: (value: unknown) => string | undefined;
}

export interface TextProps {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  placeholder?: string;
  trim?: boolean;
  uppercase?: boolean;
  lowercase?: boolean;
  autoComplete?: string;
  spellCheck?: boolean;
}
