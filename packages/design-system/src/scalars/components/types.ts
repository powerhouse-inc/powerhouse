export type ErrorMessage = string;

export type ValidatorResult = ErrorMessage | boolean;

export type ValidatorHandler = (
  value: any,
  formState: Record<string, any>,
) => ValidatorResult | Promise<ValidatorResult>;

export interface InputBaseProps<T> {
  id?: string;
  name?: string;
  label?: React.ReactNode;
  description?: string;
  value?: T;
  defaultValue?: T;
  required?: boolean;
  disabled?: boolean;
  errors?: ErrorMessage[];
  warnings?: ErrorMessage[];
  className?: string;
  autoFocus?: boolean; // is it required??
}

export interface FieldErrorHandling {
  showErrorOnBlur?: boolean;
  showErrorOnChange?: boolean;
  validators?: ValidatorHandler[] | ValidatorHandler;
}

// TODO: move this to text-field
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
