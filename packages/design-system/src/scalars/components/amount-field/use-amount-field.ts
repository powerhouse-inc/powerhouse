import { currencies } from "@/scalars/lib/data";
import { AmountValue, TypeAmount } from "../types";

interface UseAmountFieldProps {
  type: TypeAmount;
  value?: AmountValue;
  allowedCurrencies?: string[];
  allowedTokens?: string[];
}

export const useAmountField = ({ type, value }: UseAmountFieldProps) => {
  const isPercent = type === "AmountPercentage";

  const currencyOptions = currencies.map((code) => ({
    value: code.toLowerCase(),
    label: code,
  }));
  const valueToDisplay = value?.amount || 0;

  const isSearchable = currencyOptions.length >= 5;

  return {
    isPercent,
    value,
    currencyOptions,
    isSearchable,
    valueToDisplay,
  };
};
