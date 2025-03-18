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
}

export interface FieldErrorHandling {
  showErrorOnBlur?: boolean;
  showErrorOnChange?: boolean;
  validators?: ValidatorHandler[] | ValidatorHandler;
}
