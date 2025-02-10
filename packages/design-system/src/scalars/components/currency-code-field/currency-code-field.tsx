import React, { useMemo } from "react";
import { ErrorHandling, FieldCommonProps } from "../types";
import { SelectFieldRaw, withFieldValidation } from "../fragments";
import type { SelectOption } from "../enum-field/types";

export interface CurrencyCodeFieldProps
  extends FieldCommonProps<string | string[]>,
    ErrorHandling {
  placeholder?: string;
  allowedCurrencies?: string[];
  excludedCurrencies?: string[];
  includeCurrencySymbols?: boolean;
  enableAutocomplete?: boolean;
  showFlagIcons?: boolean;
  multiple?: boolean;
  maxSelection?: number;
  onChange?: (value: string | string[]) => void;
  onBlur?: () => void;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

// TODO: replace with the full list of currencies
const CURRENCIES: Currency[] = [
  { code: "ARS", name: "Argentine Peso", symbol: "$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CLP", name: "Chilean Peso", symbol: "$" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "COP", name: "Colombian Peso", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "USD", name: "United States Dollar", symbol: "$" },
  { code: "UYU", name: "Uruguayan Peso", symbol: "$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
];

const CurrencyCodeFieldRaw = React.forwardRef<
  HTMLButtonElement,
  CurrencyCodeFieldProps
>(
  (
    {
      placeholder,
      allowedCurrencies,
      excludedCurrencies,
      multiple = false,
      // maxSelection is not used in the component, but in the validation
      // declared here to prevent forwarding it to the select via props
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      maxSelection,
      // TODO: implement following props
      // includeCurrencySymbols,
      // enableAutocomplete,
      // showFlagIcons,
      ...props
    },
    ref,
  ) => {
    const options: SelectOption[] = useMemo(() => {
      const filteredCurrencies = CURRENCIES.filter((currency) => {
        // filter the allowed currencies only
        if (
          allowedCurrencies !== undefined &&
          Array.isArray(allowedCurrencies) &&
          !allowedCurrencies.includes(currency.code)
        ) {
          return false; // not allowed
        }
        // filter the excluded currencies
        if (
          excludedCurrencies !== undefined &&
          Array.isArray(excludedCurrencies) &&
          excludedCurrencies.includes(currency.code)
        ) {
          return false; // excluded
        }
        return true;
      });

      return filteredCurrencies
        .map((currency) => ({
          label: currency.name,
          value: currency.code,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }, [allowedCurrencies, excludedCurrencies]);

    return (
      <SelectFieldRaw
        ref={ref}
        options={options}
        selectionIcon="checkmark"
        searchable
        multiple={multiple}
        placeholder={placeholder}
        {...props}
      />
    );
  },
);

CurrencyCodeFieldRaw.displayName = "CurrencyCodeFieldRaw";

export const CurrencyCodeField = withFieldValidation<CurrencyCodeFieldProps>(
  CurrencyCodeFieldRaw,
  {
    validations: {
      _validateMaxSelection:
        ({ value, multiple, maxSelection }) =>
        () => {
          if (
            value === undefined ||
            (Array.isArray(value) && value.length === 0)
          )
            return true;
          if (!multiple) return true;
          if (maxSelection === undefined) return true;

          if (Array.isArray(value) && value.length > maxSelection) {
            return `You can select up to ${maxSelection} currencies only`;
          }
          return true;
        },
    },
  },
);

CurrencyCodeField.displayName = "CurrencyCodeField";
