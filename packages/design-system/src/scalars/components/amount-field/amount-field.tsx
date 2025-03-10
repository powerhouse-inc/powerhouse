import type React from "react";
import { useId, forwardRef } from "react";
import { type NumberFieldProps, NumberFieldRaw } from "../number-field";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  type SelectFieldProps,
  SelectFieldRaw,
  withFieldValidation,
} from "../fragments";
import { useAmountField } from "./use-amount-field";
import { cn } from "@/scalars/lib";
import { type InputNumberProps } from "../number-field/types";
import { type AmountValue } from "./types";
import { type AmountFieldPropsGeneric } from "./types";
import { type IconName } from "#powerhouse";
import { validateAmount } from "./amount-field-validations";

export interface TokenIcons {
  [key: string]: IconName | (() => React.JSX.Element);
}

export type AmountFieldProps = AmountFieldPropsGeneric &
  Omit<InputNumberProps, "onChange" | "onBlur" | "precision"> & {
    className?: string;
    name: string;
    numberProps?: Omit<NumberFieldProps, "name">;
    selectProps?: Omit<SelectFieldProps, "placeholder" | "selectionIcon">;
    allowedCurrencies?: string[];
    allowedTokens?: string[];
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
    placeholderSelect?: string;
  };

export const AmountFieldRaw = forwardRef<HTMLInputElement, AmountFieldProps>(
  (
    {
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
      currencyPosition = "right",
      tokenIcons,
      name,
      trailingZeros,
      viewPrecision,
      precision,
      placeholder,
      placeholderSelect,
    },
    ref,
  ) => {
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
      isAmount,
      inputFocused,
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
            className={cn(disabled && "mb-[3px]")}
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
                placeholder={placeholderSelect}
                required={required}
                options={options}
                disabled={disabled}
                onChange={handleOnChangeSelect}
                className={cn(
                  "rounded-l-md rounded-r-none border border-gray-300",
                  "border-r-[0.5px]",
                  // focus state
                  "focus:border-r-none focus:z-10 focus:ring-1 focus:ring-gray-900 focus:ring-offset-0",
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
              precision={precision}
              minValue={minValue}
              onChange={handleOnChangeInput}
              onFocus={handleIsInputFocused}
              placeholder={placeholder}
              className={cn(
                currencyPosition === "left" &&
                  "rounded-l-none border border-l-[0.5px] border-gray-300",
                currencyPosition === "right" &&
                  "rounded-r-none border border-r-[0.5px] border-gray-300",
                isPercent && "rounded-md pr-7",
                // focus state
                "focus:border-r-0",
                isAmount && "rounded-md",
                className,
              )}
              onBlur={handleBlur}
              ref={ref}
              {...(numberProps || {})}
            />
            {isPercent && !inputFocused && (
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
                placeholder={placeholderSelect}
                onChange={handleOnChangeSelect}
                options={options}
                className={cn(
                  "rounded-l-none rounded-r-md border border-gray-300",
                  "border-l-[0.5px]",
                  // focus state
                  "focus:border-l-none focus:z-10 focus:ring-1 focus:ring-gray-900 focus:ring-offset-0",
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
  },
);

AmountFieldRaw.displayName = "AmountFieldRaw";

export const AmountField = withFieldValidation<AmountFieldProps>(
  AmountFieldRaw,
  {
    validations: {
      _numericAmount: validateAmount,
    },
  },
);
AmountField.displayName = "AmountField";
