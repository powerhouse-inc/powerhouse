import { AmountCurrency, AmountType } from "../types";
import { getLabelValueCurrenct } from "@/scalars/utils/utils";

interface UseAmountFieldProps {
  value?: AmountType;
  defaultValue?: AmountType;
  allowedCurrencies?: string[];
}

export const useAmountField = ({
  value,
  defaultValue = { type: "Amount", details: { amount: 0 } },
  allowedCurrencies = [],
}: UseAmountFieldProps) => {
  // Ensure a valid value is always used
  const currentValue: AmountType = value ?? defaultValue;

  const { type, details } = currentValue;

  const isPercent = type === "AmountPercentage";
  const isCurrency = type === "AmountCurrency";

  const options = getLabelValueCurrenct(allowedCurrencies);

  const isSearchable = options.length >= 5;

  return {
    isPercent,
    isCurrency,
    isSearchable,
    options,
    valueInput: details.amount,
    valueCurrency: (details as AmountCurrency).currency,
  };
};
