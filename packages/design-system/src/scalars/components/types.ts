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
