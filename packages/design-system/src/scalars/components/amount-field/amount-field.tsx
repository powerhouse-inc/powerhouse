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
import { InputNumberProps } from "../number-field/types";
import { AmountValue } from "./types";
import { AmountFieldPropsGeneric } from "./types";
import { IconName } from "@/powerhouse";
import { validateAmount } from "./amount-field-validations";

export interface TokenIcons {
  [key: string]: IconName | (() => React.JSX.Element);
}

export type AmountFieldProps = AmountFieldPropsGeneric &
  Omit<InputNumberProps, "onChange" | "onBlur" | "precision"> & {
    className?: string;
    name: string;
    pattern?: RegExp;
    numberProps?: Omit<NumberFieldProps, "name">;
    selectProps?: SelectFieldProps;
    allowedCurrencies?: string[];
    allowedTokens?: string[];
    selectName: string;
    defaultValue?: AmountValue;
    value?: AmountValue;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
    currencyPosition?: "left" | "right";
    tokenIcons?: TokenIcons;
    allowNegative?: boolean;
    // handle precision
    viewPrecision?: number;
    precision?: number;
  };

export const AmountFieldRaw: FC<AmountFieldProps> = ({
  label,
  value,
  id: propId,
  minValue,
  maxValue,
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
  tokenIcons,
  name,
  trailingZeros,
  viewPrecision,
  precision,
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
    isBigInt,
    handleIsInputFocused,
  } = useAmountField({
    value,
    defaultValue,
    type,
    allowedCurrencies,
    allowedTokens,
    onChange,
    onBlur,
    tokenIcons,
    precision,
    viewPrecision,
    trailingZeros,
  });

  return (
    <FormGroup>
      {label && (
        <FormLabel
          htmlFor={id}
          required={required}
          disabled={disabled}
          hasError={!!errors?.length}
          className={cn(disabled && "mb-[3px] text-gray-400")}
        >
          {label}
        </FormLabel>
      )}
      <div className={cn("relative flex items-center")}>
        <input
          name={name}
          type="hidden"
          data-cast={isBigInt ? "AmountBigInt" : "AmountNumber"}
        />
        <div className={cn("relative flex items-center")}>
          {isShowSelect && currencyPosition === "left" && (
            <SelectFieldRaw
              selectionIcon="checkmark"
              value={valueSelect}
              required={required}
              options={options}
              disabled={disabled}
              onChange={handleOnChangeSelect}
              className={cn(
                "rounded-l-md rounded-r-none border border-gray-300",
                "border-r-[0.5px]",
                // focus state
                "focus:border-r-none focus:ring-1 focus:ring-gray-900  focus:ring-offset-0 focus:z-10",
                "focus:outline-none",
                selectProps?.className,
              )}
              {...(selectProps ?? { name: "" })}
            />
          )}
          <NumberFieldRaw
            name=""
            step={step}
            required={required}
            disabled={disabled}
            value={
              valueInput === undefined
                ? undefined
                : (valueInput as unknown as number)
            }
            id={id}
            maxValue={maxValue}
            trailingZeros={trailingZeros}
            precision={precision}
            minValue={minValue}
            onChange={handleOnChangeInput}
            onFocus={handleIsInputFocused}
            className={cn(
              currencyPosition === "left" &&
                "rounded-l-none border border-l-[0.5px] border-gray-300",
              currencyPosition === "right" &&
                "rounded-r-none border border-r-[0.5px] border-gray-300",
              isPercent && "pr-7",
              // focus state
              "focus:border-r-0",
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
              selectionIcon="checkmark"
              value={valueSelect}
              required={required}
              disabled={disabled}
              onChange={handleOnChangeSelect}
              options={options}
              className={cn(
                "rounded-l-none rounded-r-md border border-gray-300",
                "border-l-[0.5px]",
                // focus state
                "focus:border-l-none focus:ring-1 focus:ring-gray-900  focus:ring-offset-0 focus:z-10",
                "focus:outline-none",
                selectProps?.className,
              )}
              {...(selectProps ?? { name: "" })}
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
      _numericAmount: validateAmount,
    },
  },
);
AmountField.displayName = "AmountField";
