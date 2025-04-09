import type { FieldErrorHandling, InputBaseProps } from "../types.js";

type NumberProps = {
  numericType?: NumericType | undefined;
  minValue?: number;
  maxValue?: number;
  step?: number;
  precision?: number;
  trailingZeros?: boolean;
};

export type NumericType =
  | "PositiveInt" // Positive integers
  | "NegativeInt" // Negative integers
  | "NonNegativeInt" // Non-negative integers (>= 0)
  | "NonPositiveInt" // Non-positive integers (<= 0)
  | "NegativeFloat" // Negative float values
  | "PositiveFloat" // Positive float values
  | "NonNegativeFloat" // Non-negative float values (>= 0.0)
  | "NonPositiveFloat" // Non-positive float values (<= 0.0)
  | "BigInt"
  | "Int"
  | "Float";

export interface InputNumberProps
  extends Omit<
    InputBaseProps<string | number> &
      FieldErrorHandling &
      NumberProps &
      Omit<
        React.InputHTMLAttributes<HTMLInputElement>,
        "min" | "max" | "minLength" | "maxLength"
      >,
    "value" | "defaultValue" | "name" | "pattern"
  > {
  name: string;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  trailingZeros?: boolean;
}
