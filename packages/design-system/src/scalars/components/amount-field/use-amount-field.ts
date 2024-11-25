import { currencies } from "@/scalars/lib/currency-list";
import { AmountType, CurrencyCode } from "../types";

interface UseAmountFieldProps {
  value?: AmountType;
  defaultValue?: AmountType;
  allowedCurrencies?: string[];
}

export const useAmountField = ({
  allowedCurrencies = [],
  value,
  defaultValue,
}: UseAmountFieldProps) => {
  let valueCurrency;
  const initialValue = value ?? defaultValue ?? ({} as AmountType);
  const { type, details } = initialValue;

  const isPercent = type === "AmountPercentage";
  const isCurrency = type === "AmountCurrency";

  const options = currencies
    .filter((code) => allowedCurrencies.includes(code))
    .map((code) => ({
      value: code.toString(),
      label: code,
    }));

  const valueInput = details.amount;

  if (type === "AmountCurrency") {
    valueCurrency = details.currency;
  }
  const isSearchable = options.length >= 5;

  return {
    isPercent,
    options,
    isSearchable,
    isCurrency,
    valueInput,
    valueCurrency,
  };
};
