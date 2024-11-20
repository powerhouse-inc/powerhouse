import { currencies } from "@/scalars/lib/currency-list";
import { AmountType, CurrencyCode } from "../types";

interface UseAmountFieldProps {
  value?: AmountType;
  allowedCurrencies?: string[];
  defaultValue?: AmountType;
}

export const useAmountField = ({
  allowedCurrencies = [],
  value,
  defaultValue,
}: UseAmountFieldProps) => {
  const initialValue = value ?? defaultValue;

  const isPercent = initialValue?.type === "AmountPercentage";
  const isCurrency = initialValue?.type === "AmountCurrency";

  let valueCurrency: CurrencyCode = "USD";

  const options = currencies
    .filter((code) => allowedCurrencies.includes(code))
    .map((code) => ({
      value: code.toString(),
      label: code,
    }));

  const valueInput = initialValue?.details.amount || undefined;
  const defaultInput = initialValue?.details.amount || undefined;

  if (initialValue?.type === "AmountCurrency") {
    valueCurrency = initialValue.details.currency;
  }
  const isSearchable = options.length >= 5;

  return {
    isPercent,
    options,
    isSearchable,
    isCurrency,
    defaultInput,
    valueInput,
    valueCurrency,
  };
};
