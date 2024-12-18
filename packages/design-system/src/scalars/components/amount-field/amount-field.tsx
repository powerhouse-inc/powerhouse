import React, { FC, useId } from "react";
import { NumberFieldProps, NumberFieldRaw } from "../number-field";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  SelectFieldProps,
  SelectFieldRaw,
  withFieldValidation,
} from "../fragments";
import { useAmountField } from "./use-amount-field";
import { cn } from "@/scalars/lib";
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
    value?: AmountValue;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
    currencyPosition?: "left" | "right";
  };

const AmountFieldRaw: FC<AmountFieldProps> = ({
  label,
  value,
  id: propId,
  precision = 0,
  minValue,
  maxValue,
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
  allowedTokens = [],
  numberProps,
  selectProps,
  step = 1,
  currencyPosition,
}) => {
  const generatedId = useId();
  const id = propId ?? generatedId;
  const {
    isShowSelect,
    isPercent,
    options,
    valueSelect,
    valueInput,
    handleOnChangeInput,
    handleOnChangeSelect,
    handleBlur,
  } = useAmountField({
    value,
    defaultValue,
    type,
    allowedCurrencies,
    allowedTokens,
    onChange,
    onBlur,
  });

  return (
    <FormGroup>
      {label && (
        <FormLabel
          htmlFor={id}
          required={required}
          disabled={disabled}
          hasError={!!errors?.length}
          className={cn(disabled && "text-gray-400 mb-[3px]")}
        >
          {label}
        </FormLabel>
      )}
      <div className={cn("relative flex items-center")}>
        <div className={cn("relative flex items-center")}>
          {isShowSelect && currencyPosition === "left" && (
            <SelectFieldRaw
              optionsCheckmark="None"
              value={valueSelect}
              name=""
              required={required}
              disabled={disabled}
              onChange={handleOnChangeSelect}
              options={options}
              className={cn(
                "border border-gray-300 rounded-l-md rounded-r-none",
                "border-r-[0.5px] focus:border-r-[1px] focus:ring-1 focus:ring-gray-900",
                "focus:outline-none",
                selectProps?.className,
              )}
              {...(selectProps || {})}
            />
          )}
          <NumberFieldRaw
            step={step}
            required={required}
            disabled={disabled}
            name=""
            value={valueInput}
            id={id}
            maxValue={maxValue}
            precision={precision}
            minValue={minValue}
            trailingZeros={trailingZeros}
            onChange={handleOnChangeInput}
            className={cn(
              currencyPosition === "left" &&
                "border border-gray-300 rounded-l-none border-l-[0.5px]",
              currencyPosition === "right" &&
                "border border-gray-300 rounded-r-none border-r-[0.5px]",
              isPercent && "pr-7",
              className,
            )}
            onBlur={handleBlur}
            {...(numberProps || {})}
          />
          {isPercent && step === 0 && (
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
        {isShowSelect && currencyPosition === "right" && (
          <div>
            <SelectFieldRaw
              optionsCheckmark="None"
              value={valueSelect}
              name=""
              required={required}
              disabled={disabled}
              onChange={handleOnChangeSelect}
              options={options}
              className={cn(
                "rounded-l-none rounded-r-md border border-gray-300",
                "border-l-[0.5px] focus:border-l-[1px] focus:ring-1 focus:ring-gray-900 focus:ring-offset-0",
                "focus:outline-none",
              )}
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

export const AmountField =
  withFieldValidation<AmountFieldProps>(AmountFieldRaw);
