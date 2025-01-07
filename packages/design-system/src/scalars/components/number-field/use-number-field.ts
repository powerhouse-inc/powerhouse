import { NumericType } from "./types";
import { getDisplayValue } from "./utils";

interface UseNumberFieldProps {
  value?: number | bigint;
  maxValue?: number;
  minValue?: number;
  step?: number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  numericType?: NumericType;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  trailingZeros?: boolean;
  precision?: number;
}

export const useNumberField = ({
  value,
  maxValue,
  minValue,
  step = 1,
  onChange,
  numericType,
  onBlur,
  trailingZeros = false,
  precision = 0,
}: UseNumberFieldProps) => {
  const canIncrement =
    maxValue !== undefined &&
    (typeof value === "bigint"
      ? value >= BigInt(maxValue)
      : Number(value) >= maxValue);

  const canDecrement =
    minValue !== undefined &&
    (typeof value === "bigint"
      ? value <= BigInt(minValue)
      : Number(value) <= minValue);

  const showSteps = step !== 0;

  // Boolean to no convert float values to BigInt
  const isBigInt = numericType && numericType === "BigInt";

  // Prevent to write invalid characters and handle the arrow keys
  const preventInvalidCharsAndHandleArrows = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (["e", "E", "+"].includes(e.key)) {
      e.preventDefault();
      return;
    }
    // Handle the arrow keys
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const operation = e.key === "ArrowUp" ? "increment" : "decrement";

      // Call the handleChangeSteps function
      stepValueHandler(
        e as unknown as React.MouseEvent<HTMLButtonElement>,
        operation,
      );
    }
  };

  // Prevent pasting invalid characters
  const blockInvalidPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedData = e.clipboardData.getData("Text");
    if (/[eE]/.test(pastedData)) {
      e.preventDefault();
    }
  };

  // Avoid to write letters directly in safari
  const preventLetterInput = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const char = event.key;
    // Only prevent letters, allow all other characters
    if (/^[a-zA-Z]$/.test(char) && !(event.ctrlKey || event.metaKey)) {
      event.preventDefault();
    }
  };

  // Handle the step value
  const stepValueHandler = (
    e: React.MouseEvent<HTMLButtonElement>,
    operation: "increment" | "decrement",
  ) => {
    e.preventDefault();

    let newValue: number | bigint;

    if (isBigInt) {
      const currentValue = BigInt(value ?? 0);
      const adjustment =
        BigInt(step || 1) *
        (operation === "increment" ? BigInt(1) : BigInt(-1));
      newValue = currentValue + adjustment;
    } else {
      const currentValue = Number(value ?? 0);
      const adjustment = (step || 1) * (operation === "increment" ? 1 : -1);
      newValue = currentValue + adjustment;
    }

    if (!isBigInt) {
      if (maxValue !== undefined && Number(newValue) > maxValue) return;
      if (minValue !== undefined && Number(newValue) < minValue) return;
    }

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
    const inputValue = e.target.value;

    // If the value is not a number, not an empty string, or is empty, show the error message or keep it empty
    if (inputValue === "" || isNaN(Number(inputValue))) {
      onBlur?.(e);
      return;
    }

    const integerTypes = [
      "PositiveInt",
      "NegativeInt",
      "NonNegativeInt",
      "NonPositiveInt",
      "BigInt",
      "Int",
    ] as NumericType[];

    // Get the formatted value for keeping the trailing zeros
    const formattedValue = getDisplayValue(inputValue, {
      numericType,
      precision,
      trailingZeros,
    });

    const isNotSafeValue =
      Math.abs(Number(inputValue)) > Number.MAX_SAFE_INTEGER;

    // Evitar convertir a un valor no seguro en notación científica
    if (isNotSafeValue) {
      onBlur?.(e);
      return;
    }

    const finalValue =
      numericType && integerTypes.includes(numericType)
        ? parseFloat(inputValue).toString()
        : formattedValue;

    const nativeEvent = new Event("change", {
      bubbles: true,
      cancelable: true,
    });

    Object.defineProperty(nativeEvent, "target", {
      value: { value: finalValue },
      writable: false,
    });

    onChange?.(nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
    onBlur?.(e);
  };

  return {
    canIncrement,
    canDecrement,
    showSteps,
    preventInvalidCharsAndHandleArrows,
    stepValueHandler,
    blockInvalidPaste,
    preventLetterInput,
    isBigInt,
    handleBlur,
  };
};
