import { useMemo, useState } from "react";
import { TokenIcons } from "./amount-field";
import {
  Amount,
  AmountCurrency,
  AmountFieldPropsGeneric,
  AmountToken,
  AmountValue,
} from "./types";
import { getCountryCurrencies, getTokens } from "./utils";
import { isValidNumber } from "../number-field/number-field-validations";

interface UseAmountFieldProps {
  value?: AmountValue;
  defaultValue?: AmountValue;
  type: AmountFieldPropsGeneric["type"];
  allowedCurrencies?: string[];
  allowedTokens?: string[];
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  tokenIcons?: TokenIcons;
  viewPrecision?: number;
  numberPrecision?: number;
}

export const useAmountField = ({
  value,
  defaultValue,
  type,
  allowedCurrencies = [],
  allowedTokens = [],
  onChange,
  onBlur,
  tokenIcons,
}: UseAmountFieldProps) => {
  // Boolean to no convert float values to BigInt
  const isBigInt = type === "AmountToken";

  const currentValue = value ?? defaultValue;

  const baseValue =
    type === "Amount" || type === "AmountPercentage"
      ? (currentValue as number | undefined)
      : (currentValue as AmountCurrency | AmountToken).amount;

  const isPercent = type === "AmountPercentage";

  //Allow select only if type is AmountCurrency or AmountToken
  const isShowSelect = type === "AmountCurrency" || type === "AmountToken";

  // Filter only if allowedCurrencies is provided
  const optionsCurrencies = getCountryCurrencies(allowedCurrencies);
  const optionsTokenIcons = getTokens(allowedTokens, tokenIcons);

  const options =
    type === "AmountCurrency" ? optionsCurrencies : optionsTokenIcons;

  const valueSelect =
    type === "AmountCurrency"
      ? (currentValue as AmountCurrency).currency
      : (currentValue as AmountToken).token;

  // Handle the change of the input
  const handleOnChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    if (type === "AmountCurrency" && typeof value === "object") {
      let newValue = {
        ...value,
        amount: e.target.value === "" ? undefined : e.target.value,
      } as AmountValue;

      newValue = {
        ...value,
        amount:
          inputValue === ""
            ? undefined
            : !isValidNumber(inputValue) ||
                Math.abs(Number(inputValue)) > Number.MAX_SAFE_INTEGER
              ? inputValue
              : Number(inputValue),
      } as AmountCurrency;

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
    }
    if (type === "AmountToken" && typeof value === "object") {
      let newValueToken = {
        ...value,
        amount: e.target.value === "" ? undefined : e.target.value,
      } as AmountValue;

      newValueToken = {
        ...value,
        amount:
          inputValue === ""
            ? undefined
            : !isValidNumber(inputValue)
              ? inputValue
              : BigInt(inputValue),
      } as AmountToken;

      //Create the event
      const nativeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(nativeEvent, "target", {
        value: { value: newValueToken },
        writable: false,
      });
      onChange?.(nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
    }

    if (type === "Amount" || type === "AmountPercentage") {
      const amountValue = inputValue === "" ? undefined : inputValue;
      const newAmountValue =
        amountValue === ""
          ? undefined
          : !isValidNumber(inputValue) ||
              Math.abs(Number(inputValue)) > Number.MAX_SAFE_INTEGER
            ? inputValue
            : Number(inputValue);

      // Create the event
      const nativeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(nativeEvent, "target", {
        value: { value: newAmountValue },
        writable: false,
      });
      onChange?.(nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
    }
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

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let newValue: AmountValue = {} as unknown as AmountValue;
    // Handle the blur of the input if type is AmountCurrency or AmountToken should be a bigint
    if (type === "AmountCurrency" && typeof value === "object") {
      newValue = {
        ...value,
        amount: Number(e.target.value),
      } as AmountCurrency;

      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
    }
    if (type === "AmountToken" && typeof value === "object") {
      newValue = {
        ...value,
        amount: BigInt(e.target.value),
      } as AmountToken;

      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
    }

    if (type === "Amount" || type === "AmountPercentage") {
      newValue = Number(e.target.value);
      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
    }
  };

  return {
    isPercent,
    isShowSelect,
    options,
    valueInput: baseValue,
    valueSelect,
    handleOnChangeInput,
    handleOnChangeSelect,
    handleBlur,
    isBigInt,
  };
};
