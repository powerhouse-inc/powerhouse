export type ErrorMessage = string;

export type ValidatorResult = ErrorMessage | boolean;

export type ValidatorHandler = (
  value: any,
  formState: Record<string, any>,
) => ValidatorResult | Promise<ValidatorResult>;

export interface FormFieldProps {
  id?: string;
  name: string;
  label?: React.ReactNode;
}

export interface FieldCommonProps<T> extends FormFieldProps {
  description?: string;
  value?: T;
  defaultValue?: T;
  required?: boolean;
  disabled?: boolean;
  errors?: ErrorMessage[];
  warnings?: ErrorMessage[];
  className?: string;
}

export interface ErrorHandling {
  showErrorOnBlur?: boolean;
  showErrorOnChange?: boolean;
  customValidator?: ValidatorHandler;
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

export type NumericType =
  | "Int"
  | "Float"
  | "NegativeInt"
  | "PositiveInt"
  | "NonNegativeInt"
  | "NonPositiveInt"
  | "NegativeFloat"
  | "PositiveFloat"
  | "NonNegativeFloat"
  | "NonPositiveFloat";

export interface NumberProps {
  numericType?: NumericType;
  minValue?: number;
  maxValue?: number;
  step?: number;
  allowNegative?: boolean;
  precision?: number;
  trailingZeros?: boolean;
  decimalRequired?: boolean;
  isBigInt?: boolean;
}
