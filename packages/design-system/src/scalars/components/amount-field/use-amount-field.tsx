import {
  Amount,
  AmountCrypto,
  AmountCurrency,
  AmountFiat,
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
    if (currentValue === undefined) {
      return undefined;
    }

    // If it's an object (for any type), we extract the amount property
    if (typeof currentValue === "object") {
      return currentValue.amount;
    }

    // If it's a primitive value (for AmountPercentage)
    return currentValue;
  }, [currentValue]);

  useEffect(() => {
    if (type === "AmountPercentage") {
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
      (type === "AmountFiat" ||
        type === "AmountCrypto" ||
        type === "Amount" ||
        type === "AmountCurrency") &&
      (typeof currentValue === "number" || typeof currentValue === "string")
    ) {
      const newValue = {
        amount: currentValue,
        unit: "",
      } as AmountCurrency;
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

  const valueSelect = useMemo(() => {
    if (currentValue === undefined) {
      return undefined;
    }

    // If it's an object, we try to get the unit property
    if (typeof currentValue === "object" && "unit" in currentValue) {
      return currentValue.unit;
    }

    return undefined;
  }, [currentValue]);
  const isBigInt =
    type === "AmountCrypto" ||
    (type === "AmountCurrency" &&
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
      type === "AmountFiat"
    ) {
      if (!isValidNumber(rawAmountState) || isNotSafeValue(rawAmountState)) {
        // Return the value without formatting if not valid
        return baseValue?.toString() ?? "";
      }
    }
    if (type === "AmountCrypto") {
      return baseValue?.toString();
    }
    if (type === "AmountCurrency") {
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
  const isAmountWithUnit =
    type === "Amount" && typeof value === "object" && "unit" in value;
  const isAmountWithoutUnit = type === "Amount" && !isAmountWithUnit;

  const isShowSelect =
    (isAmountWithUnit && units && units.length > 0) ||
    type === "AmountFiat" ||
    type === "AmountCrypto" ||
    type === "AmountCurrency";

  // Handle the change of the input
  const handleOnChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    if (type === "AmountFiat" && typeof value === "object") {
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
    if (type === "AmountCrypto" && typeof value === "object") {
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

    if (type === "AmountPercentage") {
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
    if (type === "AmountCurrency" && typeof value === "object") {
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

    if (type === "Amount" && typeof value === "object") {
      const newValue = {
        ...value,
        amount: inputValue === "" ? undefined : inputValue,
      } as AmountValue;

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
    let newValue: AmountFiat | AmountCrypto | AmountCurrency | Amount = {} as
      | AmountFiat
      | AmountCrypto
      | AmountCurrency
      | Amount;
    if (type === "AmountFiat" && typeof value === "object") {
      newValue = {
        ...value,
        unit: typeof e === "string" ? e : undefined,
      } as AmountFiat;
    }
    if (type === "AmountCrypto" && typeof value === "object") {
      newValue = {
        ...value,
        unit: typeof e === "string" ? e : undefined,
      } as AmountCrypto;
    }
    if (type === "AmountCurrency" && typeof value === "object") {
      newValue = {
        ...value,
        unit: typeof e === "string" ? e : undefined,
      } as AmountCurrency;
    }
    if (type === "Amount" && typeof value === "object") {
      newValue = {
        ...value,
        unit: typeof e === "string" ? e : undefined,
      } as Amount;
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
    if (type === "AmountFiat" && typeof value === "object") {
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

    if (type === "AmountCrypto" && typeof value === "object") {
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

    // Handle the blur event for AmountCurrency
    if (type === "AmountCurrency" && typeof value === "object") {
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
    isAmountWithoutUnit,
  };
};
