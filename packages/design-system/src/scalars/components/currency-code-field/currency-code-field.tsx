import React, { useMemo } from "react";
import type { SelectOption } from "../enum-field/types.js";
import {
  FormGroup,
  FormMessageList,
  SelectFieldRaw,
} from "../fragments/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/with-field-validation.js";
import type { FieldErrorHandling, InputBaseProps } from "../types.js";
import type { AllowedTypes, Currency } from "./types.js";
import { getCurrencies } from "./utils.js";

type CurrencyCodeFieldBaseProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | keyof InputBaseProps<string | string[]>
  | keyof FieldErrorHandling
  | "onChange"
  | "onBlur"
>;

export interface CurrencyCodeFieldProps
  extends CurrencyCodeFieldBaseProps,
    InputBaseProps<string | string[]>,
    FieldErrorHandling {
  placeholder?: string;
  onChange?: (value: string | string[]) => void;
  onBlur?: () => void;
  currencies?: Currency[];
  includeCurrencySymbols?: boolean;
  favoriteCurrencies?: string[];
  symbolPosition?: "left" | "right";
  searchable?: boolean;
  contentClassName?: string;
  contentAlign?: "start" | "end" | "center";
  allowedTypes?: AllowedTypes;
}

export const CurrencyCodeFieldRaw = React.forwardRef<
  HTMLButtonElement,
  CurrencyCodeFieldProps
>(
  (
    {
      placeholder,
      currencies,
      favoriteCurrencies = [],
      includeCurrencySymbols = true,
      symbolPosition = "right",
      searchable = false,
      contentClassName,
      contentAlign = "start",
      warnings,
      errors,
      allowedTypes = "Both",
      ...props
    },
    ref,
  ) => {
    const defaultCurrencies = currencies ?? getCurrencies(allowedTypes);
    const options: SelectOption[] = useMemo(() => {
      const favoriteTickers = new Set(favoriteCurrencies);

      return (
        (defaultCurrencies
          .map((currency) => {
            if (favoriteTickers.has(currency.ticker)) {
              return null;
            }

            let label = currency.label ?? currency.ticker;
            if (includeCurrencySymbols && currency.symbol) {
              label =
                symbolPosition === "right"
                  ? `${label} (${currency.symbol})`
                  : `(${currency.symbol}) ${label}`;
            }
            const option: SelectOption = {
              label,
              value: currency.ticker,
            };

            if ("icon" in currency) {
              option.icon = currency.icon;
            }

            return option;
          })
          .filter(Boolean) as SelectOption[]) ?? []
      );
    }, [
      defaultCurrencies,
      includeCurrencySymbols,
      symbolPosition,
      favoriteCurrencies,
    ]);

    const favoriteOptions: SelectOption[] = useMemo(() => {
      const favoriteTickers = new Set(favoriteCurrencies);
      return (
        defaultCurrencies
          .filter((currency) => favoriteTickers.has(currency.ticker))
          .map((currency) => {
            let label = currency.label ?? currency.ticker;
            if (includeCurrencySymbols && currency.symbol) {
              label =
                symbolPosition === "right"
                  ? `${label} (${currency.symbol})`
                  : `(${currency.symbol}) ${label}`;
            }
            const option: SelectOption = {
              label,
              value: currency.ticker,
            };

            if ("icon" in currency) {
              option.icon = currency.icon;
            }

            return option;
          }) ?? []
      );
    }, [
      defaultCurrencies,
      favoriteCurrencies,
      includeCurrencySymbols,
      symbolPosition,
    ]);

    return (
      <FormGroup>
        <SelectFieldRaw
          ref={ref}
          options={options}
          selectionIcon="checkmark"
          searchable={searchable}
          multiple={false}
          placeholder={placeholder}
          contentAlign={contentAlign}
          contentClassName={contentClassName}
          favoriteOptions={favoriteOptions}
          {...props}
        />
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

CurrencyCodeFieldRaw.displayName = "CurrencyCodeFieldRaw";

export const CurrencyCodeField =
  withFieldValidation<CurrencyCodeFieldProps>(CurrencyCodeFieldRaw);

CurrencyCodeField.displayName = "CurrencyCodeField";
