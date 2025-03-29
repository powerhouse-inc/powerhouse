import { type AmountCurrency } from "../../../ui/components/data-entry/amount-input/types.js";
import { type AmountFieldProps } from "./amount-field.js";

export const validateAmountCurrency =
  ({ type, units }: AmountFieldProps) =>
  (value: unknown) => {
    if (!value) return true;
    if (typeof value === "object" && "unit" in value) {
      if (
        ["AmountFiat", "AmountCrypto", "AmountCurrency", "Amount"].includes(
          type,
        )
      ) {
        if (
          !units?.some(
            (currency) => currency.ticker === (value as AmountCurrency).unit,
          )
        ) {
          return "Please select a valid currency";
        }
      }
    }

    return true;
  };
