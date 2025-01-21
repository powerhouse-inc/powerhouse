import { TokenIcons } from "./amount-field";
import {
  AmountCurrencyCrypto,
  AmountCurrencyFiat,
  AmountCurrencyUniversal,
  AmountFieldPropsGeneric,
  AmountValue,
} from "./types";
import {
  displayValueAmount,
  getCountryCurrencies,
  getTokens,
  isNotSafeValue,
  isValidBigInt,
  isValidNumberGreaterThanMaxSafeInteger,
} from "./utils";
import { isValidNumber } from "../number-field/number-field-validations";
import { useMemo, useState } from "react";

interface UseAmountFieldProps {
  value?: AmountValue;
  defaultValue?: AmountValue;
  type: AmountFieldPropsGeneric["type"];
  allowedCurrencies?: string[];
  allowedTokens?: string[];
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  tokenIcons?: TokenIcons;

  precision?: number;
  viewPrecision?: number;
  trailingZeros?: boolean;
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
  precision,
  viewPrecision,
  trailingZeros,
}: UseAmountFieldProps) => {
  const currentValue = value ?? defaultValue;

  const baseValue = useMemo(() => {
    return currentValue === undefined
      ? undefined
      : type === "Amount" || type === "AmountPercentage"
        ? (currentValue as number | undefined)
        : type === "AmountCurrencyUniversal"
          ? (currentValue as AmountCurrencyUniversal).amount
          : (currentValue as AmountCurrencyFiat | AmountCurrencyCrypto).amount;
  }, [currentValue, type]);

  const valueSelect =
    currentValue === undefined
      ? undefined
      : type === "AmountCurrencyFiat"
        ? (currentValue as AmountCurrencyFiat).currency
        : type === "AmountCurrencyCrypto"
          ? (currentValue as AmountCurrencyCrypto).currency
          : type === "AmountCurrencyUniversal"
            ? (currentValue as AmountCurrencyUniversal).currency
            : undefined;

  const isBigInt =
    type === "AmountCurrencyCrypto" ||
    (type === "AmountCurrencyUniversal" &&
      isValidNumberGreaterThanMaxSafeInteger(baseValue?.toString()));

  const [inputFocused, setInputFocused] = useState(false);

  const rawAmountState = baseValue?.toString() ?? "";
  const displayValueAmountState = useMemo(() => {
    if (inputFocused) {
      return rawAmountState;
    }

    if (
      type === "Amount" ||
      type === "AmountPercentage" ||
      type === "AmountCurrencyFiat"
    ) {
      if (!isValidNumber(rawAmountState) || isNotSafeValue(rawAmountState)) {
        // Return the value without formatting if not valid
        return baseValue?.toString() ?? "";
      }
    }
    if (type === "AmountCurrencyCrypto") {
      return baseValue?.toString();
    }
    if (type === "AmountCurrencyUniversal") {
      if (isValidNumberGreaterThanMaxSafeInteger(rawAmountState)) {
        //   // Return the value without formatting if not valid
        return baseValue?.toString() ?? "";
      }
      if (!isValidNumber(rawAmountState) || isNotSafeValue(rawAmountState)) {
        // Return the value without formatting if not valid
        return baseValue?.toString() ?? "";
      }
    }
    // Here its safe to format the value
    return displayValueAmount(
      baseValue?.toString() ?? "",
      precision,
      viewPrecision,
      trailingZeros,
    );
  }, [
    inputFocused,
    type,
    baseValue,
    precision,
    viewPrecision,
    trailingZeros,
    rawAmountState,
  ]);

  const isPercent = type === "AmountPercentage";
  const isAmount = type === "Amount";

  //Allow select only if type is AmountCurrencyFiat or AmountCurrencyCrypto
  const isShowSelect =
    type === "AmountCurrencyFiat" ||
    type === "AmountCurrencyCrypto" ||
    type === "AmountCurrencyUniversal";

  // Filter only if allowedCurrencies is provided
  const optionsCurrencies = getCountryCurrencies(allowedCurrencies);
  const optionsTokenIcons = getTokens(allowedTokens, tokenIcons);

  // Options for AmountCurrencyUniversal type
  const optionsForUniversal =
    optionsCurrencies.length > 0
      ? optionsCurrencies
      : optionsTokenIcons.length > 0
        ? optionsTokenIcons
        : [];

  const options =
    type === "AmountCurrencyFiat"
      ? optionsCurrencies
      : type === "AmountCurrencyCrypto"
        ? optionsTokenIcons
        : // this can also currency fiat but its not possible to select the currency for simbol of the currency
          type === "AmountCurrencyUniversal"
          ? optionsForUniversal
          : [];
  // Handle the change of the input
  const handleOnChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    if (type === "AmountCurrencyFiat" && typeof value === "object") {
      const newValue = {
        ...value,
        amount: inputValue === "" ? undefined : inputValue,
      } as AmountValue;

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

    // Handle the change of the currency crypto
    if (type === "AmountCurrencyCrypto" && typeof value === "object") {
      const newValueCurrencyCrypto = {
        ...value,
        amount: inputValue === "" ? undefined : inputValue,
      } as AmountValue;

      //Create the event
      const nativeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(nativeEvent, "target", {
        value: { value: newValueCurrencyCrypto },
        writable: false,
      });
      onChange?.(nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
    }

    if (type === "Amount" || type === "AmountPercentage") {
      const amountValue = inputValue === "" ? undefined : inputValue;
      // Create the event
      const nativeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(nativeEvent, "target", {
        value: { value: amountValue },
        writable: false,
      });
      onChange?.(nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
    }
    // Handle the change of the universal amount
    if (type === "AmountCurrencyUniversal" && typeof value === "object") {
      const newValue = {
        ...value,
        amount: inputValue === "" ? undefined : inputValue,
      } as AmountValue;

      // Create the event
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
  };
  // Handle the change of the select
  const handleOnChangeSelect = (e: string | string[]) => {
    let newValue:
      | AmountCurrencyFiat
      | AmountCurrencyCrypto
      | AmountCurrencyUniversal = {} as
      | AmountCurrencyFiat
      | AmountCurrencyCrypto;
    if (type === "AmountCurrencyFiat" && typeof value === "object") {
      newValue = {
        ...value,
        currency: typeof e === "string" ? e : undefined,
      } as AmountCurrencyFiat;
    }
    if (type === "AmountCurrencyCrypto" && typeof value === "object") {
      newValue = {
        ...value,
        currency: typeof e === "string" ? e : undefined,
      } as AmountCurrencyCrypto;
    }
    if (type === "AmountCurrencyUniversal" && typeof value === "object") {
      newValue = {
        ...value,
        currency: typeof e === "string" ? e : undefined,
      } as AmountCurrencyUniversal;
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
    setInputFocused(false);
    const inputValue = e.target.value;
    //Avoid transformation if the value is not a number
    if (type === "AmountCurrencyFiat" && typeof value === "object") {
      if (!isValidNumber(inputValue)) {
        const newValue = {
          ...value,
          amount: inputValue,
        };
        const nativeEvent = new Event("onBlur", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(nativeEvent, "target", {
          value: { value: newValue },
          writable: false,
        });

        onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
        return;
      }

      // Avoid transformation if the value is not a number
      if (isNotSafeValue(inputValue)) {
        const newValue = {
          ...value,
          amount: inputValue,
        };
        onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
        return;
      }
      const formatValue = displayValueAmount(
        inputValue,
        precision,
        viewPrecision,
        trailingZeros,
      );
      // Update the state with the formatted value
      const newValue = {
        ...value,
        amount: formatValue,
      };
      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
    }

    if (type === "AmountCurrencyCrypto" && typeof value === "object") {
      if (!isValidBigInt(inputValue) || isNotSafeValue(inputValue)) {
        const newValue = {
          ...value,
          amount: inputValue,
        };
        const nativeEvent = new Event("onBlur", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(nativeEvent, "target", {
          value: { value: newValue },
          writable: false,
        });
        onBlur?.(nativeEvent as unknown as React.FocusEvent<HTMLInputElement>);
        return;
      }
      const newValue = {
        ...value,
        amount: inputValue,
      };
      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
    }

    if (type === "Amount" || type === "AmountPercentage") {
      if (!isValidNumber(inputValue)) {
        const nativeEvent = new Event("onBlur", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(nativeEvent, "target", {
          value: { value: inputValue },
          writable: false,
        });

        onBlur?.(nativeEvent as unknown as React.FocusEvent<HTMLInputElement>);
        return;
      }

      // Avoid transformation if the value is not a number
      if (isNotSafeValue(inputValue)) {
        const newValue = inputValue;
        const nativeEvent = new Event("onBlur", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(nativeEvent, "target", {
          value: { value: newValue },
          writable: false,
        });

        onBlur?.(nativeEvent as unknown as React.FocusEvent<HTMLInputElement>);
        return;
      }
      const formatValue = displayValueAmount(
        inputValue,
        precision,
        viewPrecision,
        trailingZeros,
      );
      const nativeEvent = new Event("onBlur", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(nativeEvent, "target", {
        value: { value: formatValue },
        writable: false,
      });

      onBlur?.(nativeEvent as unknown as React.FocusEvent<HTMLInputElement>);
      return;
    }

    // Handle the blur event for AmountCurrencyUniversal
    if (type === "AmountCurrencyUniversal" && typeof value === "object") {
      if (
        isValidBigInt(inputValue) &&
        isValidNumberGreaterThanMaxSafeInteger(inputValue)
      ) {
        const formatValue = inputValue;
        const nativeEvent = new Event("onBlur", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(nativeEvent, "target", {
          value: { value: formatValue },
          writable: false,
        });
        onBlur?.(nativeEvent as unknown as React.FocusEvent<HTMLInputElement>);
        return;
      }
      // Avoid transformation if the value is not a number
      if (!isValidNumber(inputValue)) {
        const newValue = {
          ...value,
          amount: inputValue,
        };
        const nativeEvent = new Event("onBlur", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(nativeEvent, "target", {
          value: { value: newValue },
          writable: false,
        });
        onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
        return;
      }
      const formatValue =
        viewPrecision !== undefined
          ? trailingZeros
            ? parseFloat(inputValue).toFixed(viewPrecision)
            : parseFloat(
                parseFloat(inputValue).toFixed(viewPrecision),
              ).toString()
          : inputValue;
      if (isNotSafeValue(inputValue)) {
        const newValue = {
          ...value,
          amount: inputValue,
        };
        onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
        return;
      }
      const newValue = {
        ...value,
        amount: formatValue,
      };
      onBlur?.(newValue as unknown as React.FocusEvent<HTMLInputElement>);
    }
  };

  const handleIsInputFocused = () => {
    setInputFocused(true);
  };

  return {
    isPercent,
    isShowSelect,
    options,
    valueInput: displayValueAmountState,
    valueSelect,
    handleOnChangeInput,
    handleOnChangeSelect,
    handleBlur,
    isBigInt,
    handleIsInputFocused,
    inputFocused,
    isAmount,
  };
};
