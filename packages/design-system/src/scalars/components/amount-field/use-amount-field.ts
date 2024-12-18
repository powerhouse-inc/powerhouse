import {
  AmountCurrency,
  AmountFieldPropsGeneric,
  AmountToken,
  AmountValue,
} from "./types";
import { getCountryCurrencies, getTokens } from "./utils";

interface UseAmountFieldProps {
  value?: AmountValue;
  defaultValue?: AmountValue;
  type: AmountFieldPropsGeneric["type"];
  allowedCurrencies?: string[];
  allowedTokens?: string[];
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export const useAmountField = ({
  value,
  defaultValue = 0,
  type,
  allowedCurrencies = [],
  allowedTokens = [],
  onChange,
  onBlur,
}: UseAmountFieldProps) => {
  const currentValue = value ?? defaultValue;

  const valueInput =
    type === "Amount" || type === "AmountPercentage"
      ? (currentValue as number)
      : (currentValue as AmountCurrency | AmountToken).amount;

  const isPercent = type === "AmountPercentage";

  //Allow select only if type is AmountCurrency or AmountToken
  const isShowSelect = type === "AmountCurrency" || type === "AmountToken";

  // Filter only if allowedCurrencies is provided
  const optionsCurrencies = getCountryCurrencies(allowedCurrencies);
  const optionsTokens = getTokens(allowedTokens);

  const options = type === "AmountCurrency" ? optionsCurrencies : optionsTokens;

  const valueSelect =
    type === "AmountCurrency"
      ? (currentValue as AmountCurrency).currency
      : (currentValue as AmountToken).token;

  // Handle the change of the input
  const handleOnChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue: AmountValue = {} as unknown as AmountValue;
    if (type === "AmountCurrency" && typeof value === "object") {
      newValue = {
        ...value,
        amount: Number(e.target.value),
      } as AmountValue;
    }
    if (type === "AmountToken" && typeof value === "object") {
      newValue = {
        ...value,
        amount: BigInt(e.target.value),
      } as AmountValue;
    }
    if (type === "Amount" || type === "AmountPercentage") {
      newValue = Number(e.target.value);
    }
    //Create the event
    const nativeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(nativeEvent, "target", {
      value: { value: newValue },
      writable: false,
    });
    onChange?.(nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  // Handle the change of the select
  const handleOnChangeSelect = (e: string | string[]) => {
    let newValue: AmountCurrency | AmountToken = {} as
      | AmountCurrency
      | AmountToken;
    if (type === "AmountCurrency" && typeof value === "object") {
      newValue = {
        ...value,
        currency: typeof e === "string" ? e : undefined,
      } as AmountCurrency;
    }
    if (type === "AmountToken" && typeof value === "object") {
      newValue = {
        ...value,
        token: typeof e === "string" ? e : undefined,
      } as AmountToken;
    }

    //Create the event
    const nativeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(nativeEvent, "target", {
      value: { value: newValue },
      writable: false,
    });
    onChange?.(nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  // Handle the blur of the input
  const handleBlur = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === "AmountCurrency" && typeof value === "object") {
      const newValue = {
        ...value,
        amount: e.target.value as unknown as number,
      } as AmountValue;

      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
    }
    if (type === "Amount" || type === "AmountPercentage") {
      const newValue = e.target.value as unknown as number;
      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
    }
  };

  return {
    isPercent,
    isShowSelect,
    options,
    valueInput,
    valueSelect,
    handleOnChangeInput,
    handleOnChangeSelect,
    handleBlur,
  };
};
