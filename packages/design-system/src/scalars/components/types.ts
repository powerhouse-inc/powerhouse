import { currencies } from "../lib/data";

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
  autoFocus?: boolean;
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
  validators?: ValidatorHandler[] | ValidatorHandler;
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
  | "PositiveInt" // Positive integers
  | "NegativeInt" // Negative integers
  | "NonNegativeInt" // Non-negative integers (>= 0)
  | "NonPositiveInt" // Non-positive integers (<= 0)
  | "NegativeFloat" // Negative float values
  | "PositiveFloat" // Positive float values
  | "NonNegativeFloat" // Non-negative float values (>= 0.0)
  | "NonPositiveFloat" // Non-positive float values (<= 0.0)
  | "BigInt";

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

export interface RadioGroupProps {
  options?: {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
  }[];
  onChange?: (value: string) => void;
}

export interface SelectProps {
  options?: {
    icon?: React.ComponentType<{ className?: string }>;
    value: string;
    label: string;
    disabled?: boolean;
  }[];
  placeholder?: string;
  maxSelectedOptionsToShow?: number;
  multiple?: boolean;
  searchable?: boolean;
  asModal?: boolean;
  onChange?: (value: string | string[]) => void;
}

export interface EnumBaseProps {
  optionLabels?: Record<string, string>;
  disabledOptions?: string[];
}

export type EnumProps =
  | (EnumBaseProps & {
      variant: "RadioGroup";
      onChange?: RadioGroupProps["onChange"];
    })
  | (EnumBaseProps & {
      variant: "Select";
      placeholder?: SelectProps["placeholder"];
      maxSelectedOptionsToShow?: SelectProps["maxSelectedOptionsToShow"];
      multiple?: SelectProps["multiple"];
      searchable?: SelectProps["searchable"];
      asModal?: SelectProps["asModal"];
      onChange?: SelectProps["onChange"];
    });

export type CurrencyCode = (typeof currencies)[number];

export interface Amount {
  amount: number | string;
}

export interface AmountCurrency {
  amount: number;
  currency: CurrencyCode;
}

export interface AmountPercentage {
  amount: number;
}

export type TypeAmount = "Amount" | "AmountCurrency" | "AmountPercentage";

export type AmountValue = Amount | AmountCurrency | AmountPercentage;
export interface AmountProps {
  value: AmountValue;
  type: TypeAmount;
  allowedCurrencies?: string[];
  allowedTokens?: string[];
}
