import { FieldCommonProps } from "../types";

import { ErrorHandling } from "../types";
type BaseNumberProps = {
  minValue?: number;
  maxValue?: number;
  step?: number;
  precision?: number;
  trailingZeros?: boolean;
};

// Define integer numeric types
type IntegerNumericTypes =
  | "PositiveInt"
  | "NegativeInt"
  | "NonNegativeInt"
  | "NonPositiveInt"
  | "BigInt"
  | "Int";

// Define float numeric types
type FloatNumericTypes =
  | "NegativeFloat"
  | "PositiveFloat"
  | "NonNegativeFloat"
  | "NonPositiveFloat"
  | "Float";

// Props for integer types (can have isBigInt)
type IntegerTypeProps = BaseNumberProps & {
  numericType?: IntegerNumericTypes;
  isBigInt?: boolean;
};

// Props for float types (cannot have isBigInt)
type FloatTypeProps = BaseNumberProps & {
  numericType?: FloatNumericTypes;
  isBigInt?: never;
};

// Update specific definitions
type PositiveIntProps = IntegerTypeProps & {
  numericType: "PositiveInt";
  allowNegative?: never;
};

type PositiveFloatProps = FloatTypeProps & {
  numericType: "PositiveFloat";
  allowNegative?: never;
};

type NonNegativeIntProps = IntegerTypeProps & {
  numericType: "NonNegativeInt";
  allowNegative?: never;
};

type NonNegativeFloatProps = FloatTypeProps & {
  numericType: "NonNegativeFloat";
  allowNegative?: never;
};

type OtherNumericTypeProps = (IntegerTypeProps | FloatTypeProps) & {
  numericType?: Exclude<
    NumericType,
    "PositiveInt" | "PositiveFloat" | "NonNegativeInt" | "NonNegativeFloat"
  >;
  allowNegative?: boolean;
};

export type NumberProps =
  | PositiveIntProps
  | PositiveFloatProps
  | NonNegativeIntProps
  | NonNegativeFloatProps
  | OtherNumericTypeProps;

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
    FieldCommonProps<string | number> &
      NumberProps &
      ErrorHandling &
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
  allowNegative?: boolean;
  isBigInt?: boolean;
}
