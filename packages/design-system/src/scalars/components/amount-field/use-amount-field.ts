import { getLabelValueCurrenct } from "@/scalars/utils/utils";
import { AmountCurrency, AmountFieldPropsGeneric, AmountValue } from "./types";

interface UseAmountFieldProps {
  value?: AmountValue;
  defaultValue?: AmountValue;
  type: AmountFieldPropsGeneric["type"];
  allowedCurrencies?: string[];
}

export const useAmountField = ({
  value,
  defaultValue = 0,
  type,
  allowedCurrencies = [],
}: UseAmountFieldProps) => {
  const currentValue = value ?? defaultValue;

  const valueInput =
    type === "Amount" || type === "AmountPercentage"
      ? (currentValue as number)
      : (currentValue as AmountCurrency).amount;
  const isPercent = type === "AmountPercentage";
  const isCurrency = type === "AmountCurrency";

  const options = getLabelValueCurrenct(allowedCurrencies);
  const currency =
    type === "AmountCurrency" ? (currentValue as AmountCurrency).currency : "";

  const isSearchable = options.length >= 5;

  return {
    isPercent,
    isCurrency,
    isSearchable,
    options,
    valueInput,
    currency,
  };
};
