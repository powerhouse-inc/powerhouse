import React, { useMemo } from "react";
import { ErrorHandling, FieldCommonProps } from "../types";
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
  symbolPosition?: "left" | "right";
  searchable?: boolean;
  classNameContent?: string;
  align?: "start" | "end" | "center";
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
      classNameContent,
      align = "start",
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
        align={align}
        classNameContent={classNameContent}
        {...props}
      />
    );
  },
);

CurrencyCodeFieldRaw.displayName = "CurrencyCodeFieldRaw";

export const CurrencyCodeField =
  withFieldValidation<CurrencyCodeFieldProps>(CurrencyCodeFieldRaw);

CurrencyCodeField.displayName = "CurrencyCodeField";
