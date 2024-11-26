import React, { FC, useId } from "react";
import { AmountCurrency, AmountType, InputNumberProps } from "../types";
import { NumberFieldProps, NumberFieldRaw } from "../number-field";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  SelectField,
  SelectFieldProps,
  withFieldValidation,
} from "../fragments";
import { useAmountField } from "./use-amount-field";
import { cn } from "@/scalars/lib";
import {
  mapToValidationProps,
  validatePositive,
} from "../number-field/numberFieldValidations";

export interface AmountFieldProps
  extends Omit<InputNumberProps, "onChange" | "onBlur"> {
  className?: string;
  name: string;
  pattern?: RegExp;
  numberProps?: Omit<NumberFieldProps, "name">;
  selectProps?: Omit<SelectFieldProps, "name">;
  allowedCurrencies?: string[];
  allowedTokens?: string[];
  selectName: string;
  value?: AmountType;
  defaultValue?: AmountType;
  onChange?: (event: AmountType) => void;
  onBlur?: (event: AmountType) => void;
}

const AmountFieldRaw: FC<AmountFieldProps> = ({
  label,
  value,
  id: propId,
  precision = 0,
  minValue,
  maxValue,
  allowNegative,
  trailingZeros,
  onChange = () => {},
  onBlur,
  disabled,
  className,
  required,
  errors,
  warnings,
  description,
  defaultValue,
  allowedCurrencies = [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allowedTokens = [],
  numberProps,
  selectProps,
}) => {
  const generatedId = useId();
  const id = propId ?? generatedId;
  const {
    isCurrency,
    isPercent,
    isSearchable,
    valueInput,
    valueCurrency,
    options,
  } = useAmountField({
    value,
    defaultValue,
    allowedCurrencies,
  });

  const getNewValue = ({
    amount,
    currency,
  }: {
    amount?: number;
    currency?: string;
  }) => {
    const { details } = value || {};
    const newValue = {
      ...value,
      details: {
        ...details,
        amount: amount || details?.amount,
        currency: currency || (details as AmountCurrency).currency,
      },
    } as AmountType;
    return newValue;
  };

  const handleChange = (
    e: (string | string[]) | React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newValue = getNewValue({
      currency: typeof e === "string" ? e : undefined,
      amount:
        typeof e !== "string"
          ? ((e as React.ChangeEvent<HTMLInputElement>).target
              .value as unknown as number)
          : undefined,
    });

    onChange(newValue);
  };

  const handleBlur = (
    e: (string | string[]) | React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newValue = getNewValue({
      currency: typeof e === "string" ? e : undefined,
      amount:
        typeof e !== "string"
          ? ((e as React.ChangeEvent<HTMLInputElement>).target
              .value as unknown as number)
          : undefined,
    });

    onBlur?.(newValue);
  };

  return (
    <FormGroup>
      {label && (
        <FormLabel
          htmlFor={id}
          required={required}
          disabled={disabled}
          hasError={!!errors?.length}
          className={cn(disabled && "text-gray-400")}
        >
          {label}
        </FormLabel>
      )}
      <div className={cn("relative flex items-center gap-1")}>
        <div className={cn("relative flex items-center")}>
          <NumberFieldRaw
            required={required}
            disabled={disabled}
            name=""
            defaultValue={valueInput}
            value={valueInput}
            id={id}
            maxValue={maxValue}
            precision={precision}
            minValue={minValue}
            allowNegative={allowNegative}
            trailingZeros={trailingZeros}
            onChange={handleChange}
            className={cn("flex-1 pr-6 outline-none", className)}
            showErrorOnBlur
            onBlur={handleBlur}
            showErrorOnChange
            {...(numberProps || {})}
          />
          {isPercent && (
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 right-2 ml-2 flex items-center",
                disabled ? "text-gray-400" : "text-gray-900",
              )}
            >
              %
            </span>
          )}
        </div>
        {isCurrency && (
          <div>
            <SelectField
              optionsCheckmark="None"
              value={valueCurrency}
              defaultValue={valueCurrency}
              searchable={isSearchable}
              name=""
              required={required}
              disabled={disabled}
              onChange={handleChange}
              options={options}
              {...(selectProps || {})}
            />
          </div>
        )}
      </div>
      {description && <FormDescription>{description}</FormDescription>}
      {warnings && <FormMessageList messages={warnings} type="warning" />}
      {errors && <FormMessageList messages={errors} type="error" />}
    </FormGroup>
  );
};

export const AmountField = withFieldValidation<AmountFieldProps>(
  AmountFieldRaw,
  {
    validations: {
      _positive:
        ({ allowNegative }: AmountFieldProps) =>
        (value: AmountType): true | string => {
          const {
            details: { amount },
          } = value;
          return allowNegative || Number(amount) >= 0
            ? true
            : "Value must be a positive value";
        },

      _isBigInt:
        ({ isBigInt }: AmountFieldProps) =>
        (value: AmountType) => {
          const {
            details: { amount },
          } = value;
          const stringValue = String(amount);
          const isLargeNumber =
            Math.abs(Number(stringValue)) > Number.MAX_SAFE_INTEGER;
          return isLargeNumber && !isBigInt
            ? "Value is too large for standard integer"
            : true;
        },
      _precision:
        ({ precision }: AmountFieldProps) =>
        (value: unknown) => {
          const stringValue = String(value);
          if (precision === undefined) {
            return !stringValue.includes(".")
              ? true
              : "Value must be an integer";
          }

          const decimalPart = stringValue.split(".")[1];
          if (precision === 0) {
            return !decimalPart ? true : "Value must be an integer";
          }

          return decimalPart && decimalPart.length <= precision
            ? true
            : `Value must have ${precision} decimal places or fewer`;
        },
      _trailingZeros:
        ({ trailingZeros, precision }: AmountFieldProps) =>
        (value: unknown) => {
          const stringValue = String(value);
          if (!trailingZeros) return true;
          const hasTrailingZeros =
            stringValue.split(".")[1]?.length === precision;
          return hasTrailingZeros
            ? true
            : `Value must have exactly ${precision} decimal places`;
        },
      _decimalRequired:
        ({ decimalRequired }: AmountFieldProps) =>
        (value: unknown) => {
          const stringValue = String(value);
          return decimalRequired && !stringValue.includes(".")
            ? "Value must include a decimal point"
            : true;
        },
    },
  },
);
