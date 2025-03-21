import { cn, type NumberFieldProps, NumberFieldRaw } from "#scalars";
import { forwardRef, useId } from "react";
import { CurrencyCodeFieldRaw } from "../currency-code-field/currency-code-field.js";
import type { Currency } from "../currency-code-field/types.js";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
  type SelectFieldProps,
} from "../fragments/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/with-field-validation.js";
import type { InputNumberProps } from "../number-field/types.js";
import { validateAmountCurrency } from "./amount-currency-validations.js";
import { validateAmount } from "./amount-field-validations.js";
import type { AmountFieldPropsGeneric, AmountValue } from "./types.js";
import { useAmountField } from "./use-amount-field.js";

export type AmountFieldProps = AmountFieldPropsGeneric &
  Omit<InputNumberProps, "onChange" | "onBlur" | "precision"> & {
    className?: string;
    name: string;
    numberProps?: Omit<NumberFieldProps, "name">;
    selectProps?: Omit<
      SelectFieldProps,
      "placeholder" | "selectionIcon" | "onBlur"
    >;
    defaultValue?: AmountValue;
    value?: AmountValue;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
    currencyPosition?: "left" | "right";
    symbolPosition?: "left" | "right";
    allowNegative?: boolean;
    // handle precision
    viewPrecision?: number;
    precision?: number;
    placeholderSelect?: string;
    units?: Currency[];
    includeCurrencySymbols?: boolean;
  };

const AmountFieldRaw = forwardRef<HTMLInputElement, AmountFieldProps>(
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
      numberProps,
      selectProps,
      step = 1,
      currencyPosition = "right",
      name,
      trailingZeros,
      viewPrecision,
      precision,
      placeholder,
      placeholderSelect,
      units,
      includeCurrencySymbols,
      symbolPosition,
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
      isAmountWithoutUnit,
      inputFocused,
    } = useAmountField({
      value,
      defaultValue,
      type,
      onChange,
      onBlur,
      precision,
      viewPrecision,
      trailingZeros,
      units,
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
              <CurrencyCodeFieldRaw
                contentAlign="start"
                contentClassName="[&]:!w-[100px] w-full"
                disabled={disabled}
                currencies={options ?? []}
                onChange={handleOnChangeSelect}
                placeholder={placeholderSelect}
                includeCurrencySymbols={includeCurrencySymbols}
                symbolPosition={symbolPosition}
                searchable={false}
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
                isAmountWithoutUnit && "rounded-md",
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
            <CurrencyCodeFieldRaw
              contentAlign="end"
              contentClassName="[&]:!w-[100px] w-full"
              disabled={disabled}
              includeCurrencySymbols={includeCurrencySymbols}
              currencies={options ?? []}
              value={valueSelect}
              onChange={handleOnChangeSelect}
              name=""
              placeholder={placeholderSelect}
              symbolPosition={symbolPosition}
              searchable={false}
              className={cn(
                "rounded-l-none rounded-r-md border border-gray-300",
                "border-l-[0.5px]",
                // focus state
                "focus:border-l-none focus:z-10 focus:ring-1 focus:ring-gray-900 focus:ring-offset-0",
                "focus:outline-none",
                selectProps?.className,
              )}
            />
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
      _validOptionCurrency: validateAmountCurrency,
    },
  },
);
AmountField.displayName = "AmountField";
