import React, { useMemo } from "react";
import { type ErrorHandling, type FieldCommonProps } from "../types";
import { SelectFieldRaw, withFieldValidation } from "../fragments";
import type { SelectOption } from "../enum-field/types";
import type { Currency, CurrencyType } from "./types";
export interface CurrencyCodeFieldProps
  extends FieldCommonProps<string | string[]>,
    ErrorHandling {
  placeholder?: string;
  onChange?: (value: string | string[]) => void;
  onBlur?: () => void;
  currencies?: Currency[];
  includeCurrencySymbols?: boolean;
  allowedTypes?: CurrencyType | "Both";
  favoriteCurrencies?: string[];
}

const CurrencyCodeFieldRaw = React.forwardRef<
  HTMLButtonElement,
  CurrencyCodeFieldProps
>(
  (
    {
      placeholder,
      currencies,
      includeCurrencySymbols = true,
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
            label = `${label} (${currency.symbol})`;
          }
          return {
            label,
            value: currency.ticker,
          };
        }) ?? []
      );
    }, [currencies, includeCurrencySymbols]);

    return (
      <SelectFieldRaw
        ref={ref}
        options={options}
        selectionIcon="checkmark"
        searchable
        multiple={false}
        placeholder={placeholder}
        {...props}
      />
    );
  },
);

CurrencyCodeFieldRaw.displayName = "CurrencyCodeFieldRaw";

export const CurrencyCodeField =
  withFieldValidation<CurrencyCodeFieldProps>(CurrencyCodeFieldRaw);

CurrencyCodeField.displayName = "CurrencyCodeField";
