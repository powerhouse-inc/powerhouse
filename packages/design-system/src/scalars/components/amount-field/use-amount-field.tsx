import {
  AmountCurrencyCrypto,
  AmountCurrencyFiat,
  AmountCurrencyUniversal,
  AmountFieldPropsGeneric,
  AmountValue,
} from "./types";
import {
  displayValueAmount,
  getDefaultUnits,
  isNotSafeValue,
  isValidBigInt,
  isValidNumberGreaterThanMaxSafeInteger,
} from "./utils";
import { isValidNumber } from "../number-field/number-field-validations";
import { useEffect, useMemo, useState } from "react";
import { Currency } from "../currency-code-field";

interface UseAmountFieldProps {
  value?: AmountValue;
  defaultValue?: AmountValue;
  type: AmountFieldPropsGeneric["type"];
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  precision?: number;
  viewPrecision?: number;
  trailingZeros?: boolean;
  units?: Currency[];
}

export const useAmountField = ({
  value,
  defaultValue,
  type,
  onChange,
  onBlur,
  precision,
  viewPrecision,
  trailingZeros,
  units,
}: UseAmountFieldProps) => {
  const currentValue = value ?? defaultValue;

  const baseValue = useMemo(() => {
    // Check if the value is an object and the type is Amount or AmountPercentage
    if (
      (type === "Amount" || type === "AmountPercentage") &&
      typeof currentValue === "object"
    ) {
      return currentValue.amount;
    }

    return currentValue === undefined
      ? undefined
      : type === "Amount" || type === "AmountPercentage"
        ? (currentValue as number | undefined)
        : type === "AmountCurrencyUniversal"
          ? (currentValue as AmountCurrencyUniversal).amount
          : (currentValue as AmountCurrencyFiat | AmountCurrencyCrypto).amount;
  }, [currentValue, type]);

  useEffect(() => {
    if (type === "Amount" || type === "AmountPercentage") {
      if (typeof currentValue === "object") {
        const newValue =
          (currentValue.amount as unknown) === ""
            ? ""
            : (currentValue.amount as unknown) === undefined
              ? ""
              : currentValue.amount;
        const nativeEvent = new Event("change", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(nativeEvent, "target", {
          value: { value: newValue },
          writable: false,
        });
        onChange?.(newValue as unknown as React.ChangeEvent<HTMLInputElement>);
        return;
      }
      if (
        typeof currentValue === "number" ||
        typeof currentValue === "string" ||
        typeof currentValue === "bigint" ||
        typeof currentValue === "undefined"
      ) {
        const nativeEvent = new Event("change", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(nativeEvent, "target", {
          value: { value: currentValue },
          writable: false,
        });
        onChange?.(
          nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>,
        );
      }
    }
    if (
      (type === "AmountCurrencyFiat" ||
        type === "AmountCurrencyCrypto" ||
        type === "AmountCurrencyUniversal") &&
      (typeof currentValue === "number" || typeof currentValue === "string")
    ) {
      const newValue = {
        amount: currentValue,
        currency: "",
      } as AmountCurrencyFiat;
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
  }, [currentValue, onChange, type]);

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
  const options = units ?? getDefaultUnits(type);
  //Put the placeholder in case that value its not in the options
  const validatedValueSelect =
    valueSelect && units?.some((unit) => unit.ticker === valueSelect)
      ? valueSelect
      : undefined;

  return {
    isPercent,
    isShowSelect,
    options,
    valueInput: displayValueAmountState,
    valueSelect: validatedValueSelect,
    handleOnChangeInput,
    handleOnChangeSelect,
    handleBlur,
    isBigInt,
    handleIsInputFocused,
    inputFocused,
    isAmount,
  };
};
