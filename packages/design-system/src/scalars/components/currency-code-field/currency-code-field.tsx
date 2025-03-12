import React, { useMemo } from "react";
import type { SelectOption } from "../enum-field/types.js";
import { SelectFieldRaw } from "../fragments/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/with-field-validation.js";
import type { ErrorHandling, FieldCommonProps } from "../types.js";
import type { Currency, CurrencyType } from "./types.js";

type CurrencyCodeFieldBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | keyof FieldCommonProps<string | string[]>
  | keyof ErrorHandling
  | "onChange"
  | "onBlur"
>;

export interface CurrencyCodeFieldProps
  extends CurrencyCodeFieldBaseProps,
    FieldCommonProps<string | string[]>,
    ErrorHandling {
  placeholder?: string;
  onChange?: (value: string | string[]) => void;
  onBlur?: () => void;
  currencies?: Currency[];
  includeCurrencySymbols?: boolean;
  allowedTypes?: CurrencyType | "Both";
  favoriteCurrencies?: string[];
  symbolPosition?: "left" | "right";
  searchable?: boolean;
  contentClassName?: string;
  contentAlign?: "start" | "end" | "center";
}

export const CurrencyCodeFieldRaw = React.forwardRef<
  HTMLButtonElement,
  CurrencyCodeFieldProps
>(
  (
    {
      placeholder,
      currencies,
      includeCurrencySymbols = true,
      symbolPosition = "right",
      searchable = false,
      contentClassName,
      contentAlign = "start",
      // TODO: implement following props
      // allowedTypes = "Both",
      // favoriteCurrencies,
      ...props
    },
    ref,
  ) => {
    const options: SelectOption[] = useMemo(() => {
      return (
        currencies?.map((currency) => {
          let label = currency.label ?? currency.ticker;
          if (includeCurrencySymbols && currency.symbol) {
            label =
              symbolPosition === "right"
                ? `${label} (${currency.symbol})`
                : `(${currency.symbol}) ${label}`;
          }
          return {
            label,
            value: currency.ticker,
          };
        }) ?? []
      );
    }, [currencies, includeCurrencySymbols, symbolPosition]);

    return (
      <SelectFieldRaw
        ref={ref}
        options={options}
        selectionIcon="checkmark"
        searchable={searchable}
        multiple={false}
        placeholder={placeholder}
        contentAlign={contentAlign}
        contentClassName={contentClassName}
        {...props}
      />
    );
  },
);

CurrencyCodeFieldRaw.displayName = "CurrencyCodeFieldRaw";

export const CurrencyCodeField =
  withFieldValidation<CurrencyCodeFieldProps>(CurrencyCodeFieldRaw);

CurrencyCodeField.displayName = "CurrencyCodeField";
