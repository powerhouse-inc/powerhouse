import React, { FC, useId } from "react";
import { AmountType, InputNumberProps } from "../types";
import { NumberField, NumberFieldProps } from "../number-field";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  SelectField,
  SelectFieldProps,
} from "../fragments";
import { useAmountField } from "./use-amount-field";
import { cn } from "@/scalars/lib";

export interface AmountFieldProps extends InputNumberProps {
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
}

const AmountField: FC<AmountFieldProps> = ({
  name,
  label,
  value,
  id: propId,
  precision = 0,
  minValue,
  maxValue,
  allowNegative,
  trailingZeros,
  onChange,
  disabled,
  className,
  required,
  errors,
  warnings,
  description,
  defaultValue,
  selectName,
  allowedCurrencies = [],
  // Disable becasue its WIP, and this are default config
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
    allowedCurrencies,
    defaultValue,
  });
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
          <NumberField
            required={required}
            disabled={disabled}
            name={name}
            defaultValue={valueInput}
            value={valueInput}
            id={id}
            maxValue={maxValue}
            precision={precision}
            minValue={minValue}
            allowNegative={allowNegative}
            trailingZeros={trailingZeros}
            onChange={onChange}
            className={cn("flex-1 pr-6 outline-none", className)}
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
        {!isPercent && isCurrency && (
          <div>
            <SelectField
              value={valueCurrency}
              defaultValue={valueCurrency}
              searchable={isSearchable}
              name={selectName}
              required={required}
              disabled={disabled}
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

export { AmountField };
