import React, { FC, useId } from "react";
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
  validateIsBigIntAmount,
  validatePositiveAmount,
  validatePrecisionAmount,
  validateTrailingZerosAmount,
} from "./amount-field-validations";
import { AmountFieldPropsGeneric, AmountValue } from "./types";
import { InputNumberProps } from "../number-field/types";

export type AmountFieldProps = AmountFieldPropsGeneric &
  Omit<InputNumberProps, "onChange" | "onBlur"> & {
    className?: string;
    name: string;
    pattern?: RegExp;
    numberProps?: Omit<NumberFieldProps, "name">;
    selectProps?: Omit<SelectFieldProps, "name">;
    allowedCurrencies?: string[];
    allowedTokens?: string[];
    selectName: string;
    defaultValue?: AmountValue;
    onChange?: (event: AmountValue) => void;
    onBlur?: (event: AmountValue) => void;
  };

const AmountFieldRaw: FC<AmountFieldProps> = ({
  label,
  value,
  id: propId,
  precision = 0,
  minValue,
  maxValue,
  allowNegative,
  trailingZeros,
  onChange,
  onBlur,
  disabled,
  className,
  required,
  errors,
  warnings,
  description,
  defaultValue,
  type,
  allowedCurrencies = [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allowedTokens = [],
  numberProps,
  selectProps,
}) => {
  const generatedId = useId();
  const id = propId ?? generatedId;
  const { isCurrency, isPercent, isSearchable, valueInput, options, currency } =
    useAmountField({
      value,
      defaultValue,
      type,
      allowedCurrencies,
    });

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === "AmountCurrency" && typeof value === "object") {
      const newValue = {
        ...value,
        amount: e.target.value as unknown as number,
      } as AmountValue;

      onChange?.(newValue);
    }
    if (type === "Amount" || type === "AmountPercentage") {
      const newValue = {
        amount: e.target.value as unknown as number,
      } as AmountValue;
      onChange?.(newValue);
    }
  };
  const handleOnChangeSelect = (e: string | string[]) => {
    if (type === "AmountCurrency" && typeof value === "object") {
      const newValue = {
        ...value,
        currency: typeof e === "string" ? e : undefined,
      } as AmountValue;

      onChange?.(newValue);
    }
  };
  const handleBlur = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === "AmountCurrency") {
      const newValue = {
        ...value,
        amount: e.target.value as unknown as number,
      } as AmountValue;

      onBlur?.(newValue);
    }
    if (type === "Amount" || type === "AmountPercentage") {
      const newValue = e.target.value as unknown as number;
      onBlur?.(newValue);
    }
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
            onChange={handleOnChange}
            className={cn("flex-1 pr-6 outline-none", className)}
            showErrorOnBlur
            showErrorOnChange
            onBlur={handleBlur}
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
              value={currency}
              searchable={isSearchable}
              name=""
              required={required}
              disabled={disabled}
              onChange={handleOnChangeSelect}
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
      _positive: validatePositiveAmount,
      _isBigInt: validateIsBigIntAmount,
      _precision: validatePrecisionAmount,
      _trailingZeros: validateTrailingZerosAmount,
    },
  },
);
