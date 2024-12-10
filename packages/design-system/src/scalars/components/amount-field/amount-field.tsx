import React, { FC, useId } from "react";
import { InputNumberProps } from "../types";
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
import {
  validateIsBigIntAmount,
  validatePositiveAmount,
} from "./amount-field-validations";
import { AmountFieldPropsGeneric, AmountValue } from "./types";

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
  step = 1,
  currencyPosition,
}) => {
  const generatedId = useId();
  const id = propId ?? generatedId;
  const { isCurrency, isPercent, isSearchable, options, currency } =
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
        amount: Number(e.target.value),
      } as AmountValue;

      //Create the event
      const nativeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(nativeEvent, "target", {
        value: { value: newValue },
        writable: false,
      });
      onChange?.(newValue as unknown as React.ChangeEvent<HTMLInputElement>);
    }
    if (
      type === "Amount" ||
      (type === "AmountPercentage" && typeof value === "number")
    ) {
      const newValue = Number(e.target.value);
      //Create the event
      const nativeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(nativeEvent, "target", {
        value: { value: newValue },
        writable: false,
      });
      onChange?.(newValue as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  };
  const handleOnChangeSelect = (e: string | string[]) => {
    if (type === "AmountCurrency" && typeof value === "object") {
      const newValue = {
        ...value,
        currency: typeof e === "string" ? e : undefined,
      } as AmountValue;

      //Create the event
      const nativeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(nativeEvent, "target", {
        value: { value: newValue },
        writable: false,
      });

      onChange?.(newValue as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  };
  const handleBlur = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === "AmountCurrency" && typeof value === "object") {
      const newValue = {
        ...value,
        amount: e.target.value as unknown as number,
      } as AmountValue;

      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
    }
    if (type === "Amount" || type === "AmountPercentage") {
      const newValue = e.target.value as unknown as number;
      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
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
          className={cn(disabled && "text-gray-400 mb-[3px]")}
        >
          {label}
        </FormLabel>
      )}
      <div className={cn("relative flex items-center")}>
        <div className={cn("relative flex items-center")}>
          {isCurrency && currencyPosition === "left" && (
            <SelectFieldRaw
              optionsCheckmark="None"
              value={currency}
              searchable={isSearchable}
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
            value={
              type === "Amount" || type === "AmountPercentage"
                ? value
                : value?.amount
            }
            id={id}
            maxValue={maxValue}
            precision={precision}
            minValue={minValue}
            allowNegative={allowNegative}
            trailingZeros={trailingZeros}
            onChange={handleOnChange}
            className={cn(
              currencyPosition === "left" &&
                "border border-gray-300 rounded-l-none border-l-[0.5px]",
              currencyPosition === "right" &&
                "border border-gray-300 rounded-r-none border-r-[0.5px]",
              isPercent && "pr-7", // Añadido padding derecho cuando es porcentaje
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
        {isCurrency && currencyPosition === "right" && (
          <div>
            <SelectFieldRaw
              optionsCheckmark="None"
              value={currency}
              searchable={isSearchable}
              name=""
              required={required}
              disabled={disabled}
              onChange={handleOnChangeSelect}
              options={options}
              className={cn(
                "border border-gray-300 rounded-r-md rounded-l-none",
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

export const AmountField = withFieldValidation<AmountFieldProps>(
  AmountFieldRaw,
  {
    validations: {
      _positive: validatePositiveAmount,
      _isBigInt: validateIsBigIntAmount,
    },
  },
);
