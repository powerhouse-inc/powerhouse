import { forwardRef, useId } from "react";
import { Input } from "../fragments/input";
import { FormLabel } from "../fragments/form-label";
import { FormMessageList } from "../fragments/form-message";
import { FormGroup } from "../fragments/form-group";
import { InputNumberProps } from "../types";
import { FormDescription } from "../fragments/form-description";
import { cn } from "@/scalars/lib";
import { withFieldValidation } from "../fragments/with-field-validation";
import {
  validateIsBigInt,
  validateNumericType,
} from "./number-field-validations";
import { Icon } from "@/powerhouse/components/icon";
import { regex } from "./utils";

export interface NumberFieldProps extends InputNumberProps {
  name: string;
  value?: number | bigint;
  defaultValue?: number | bigint;
  className?: string;
  pattern?: RegExp;
}
export const NumberFieldRaw = forwardRef<HTMLInputElement, NumberFieldProps>(
  (
    {
      label,
      name,
      description,
      value,
      defaultValue,
      onChange,
      onBlur,
      errors,
      warnings,
      className,
      id: propId,
      minValue,
      maxValue,
      step = 1,
      pattern,
      isBigInt = false,
      //Disable this for the transformations values
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      trailingZeros = false,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      precision = 0,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = propId ?? generatedId;
    const isIncrementDisabled =
      maxValue !== undefined &&
      (typeof value === "bigint"
        ? value >= BigInt(maxValue)
        : Number(value) >= maxValue);

    const isDecrementDisabled =
      minValue !== undefined &&
      (typeof value === "bigint"
        ? value <= BigInt(minValue)
        : Number(value) <= minValue);

    const showSteps = step !== 0;

    // Prevent to write invalid characters
    const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (["e", "E"].includes(e.key)) {
        e.preventDefault();
        return;
      }
      // Handle the arrow keys
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const operation = e.key === "ArrowUp" ? "increment" : "decrement";

        // Call the handleChangeSteps function
        handleChangeSteps(
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
    const handleChangeSteps = (
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
      let numericValue: number | bigint | string;
      const inputValue = e.target.value;
      // if its empty, keep it empty
      if (!inputValue || inputValue === "") {
        onBlur?.(e);
        return;
      }

      if (isBigInt || props.numericType === "BigInt") {
        const normalizedValue = inputValue.replace(/[^\d-]/g, "");
        numericValue = BigInt(normalizedValue);
      } else {
        // keep the value if its greater than MAX_SAFE_INTEGER
        if (Math.abs(Number(inputValue)) > Number.MAX_SAFE_INTEGER) {
          numericValue = inputValue;
        } else {
          numericValue = value?.toString() ?? "";
        }
      }

      //Check if the value is a number and if its greater than the max safe integer
      if (
        !isBigInt &&
        Math.abs(Number(numericValue)) > Number.MAX_SAFE_INTEGER
      ) {
        const nativeEvent = new Event("change", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(nativeEvent, "target", {
          value: { value: numericValue },
          writable: false,
        });
        onChange?.(
          nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>,
        );
        onBlur?.(e);
        // Add return to avoid the conversion after
        return;
      }

      //This case its safe to convert to bigInt or number
      const finalValue = isBigInt ? BigInt(numericValue) : Number(numericValue);
      const nativeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });
      // If the value is will be acept send string the use formattedValue instead of finalValue
      Object.defineProperty(nativeEvent, "target", {
        value: { value: finalValue },
        writable: false,
      });
      onChange?.(nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
      onBlur?.(e);
    };

    // Avoid to write letters directly in safari
    const handleInput = (event: React.KeyboardEvent<HTMLInputElement>) => {
      const char = event.key;
      // Only prevent letters, allow all other characters
      if (/^[a-zA-Z]$/.test(char) && !(event.ctrlKey || event.metaKey)) {
        event.preventDefault();
      }
    };

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={props.required}
            disabled={props.disabled}
            hasError={!!errors?.length}
            className="mb-[3px]"
          >
            {label}
          </FormLabel>
        )}
        <div className="relative flex items-center">
          <Input
            id={id}
            name={name}
            className={cn(className, showSteps && "pr-8")}
            pattern={isBigInt ? regex.toString() : pattern?.toString()}
            type="number"
            min={minValue}
            max={maxValue}
            aria-valuemin={minValue}
            aria-valuemax={maxValue}
            aria-invalid={!!errors?.length}
            onKeyDown={(e) => {
              handleInput(e);
              blockInvalidChar(e);
            }}
            value={value === undefined ? "" : value.toString()}
            onBlur={handleBlur}
            defaultValue={defaultValue?.toString()}
            onChange={onChange}
            onPaste={blockInvalidPaste}
            ref={ref}
            data-cast={isBigInt ? "BigInt" : "Number"}
            {...props}
          />
          {showSteps && (
            <div className="absolute inset-y-2 right-3 flex flex-col justify-center">
              <button
                disabled={isIncrementDisabled}
                type="button"
                onClick={(e) => handleChangeSteps(e, "increment")}
              >
                <Icon
                  size={10}
                  name="ChevronDown"
                  className={cn(
                    "rotate-180 text-gray-700 dark:text-gray-300",
                    isIncrementDisabled && "cursor-not-allowed",
                  )}
                />
              </button>
              <button
                disabled={isDecrementDisabled}
                type="button"
                onClick={(e) => handleChangeSteps(e, "decrement")}
              >
                <Icon
                  size={10}
                  name="ChevronDown"
                  className={cn(
                    " items-center justify-center text-gray-700 dark:text-gray-300",
                    isDecrementDisabled && "cursor-not-allowed",
                  )}
                />
              </button>
            </div>
          )}
        </div>
        {description && <FormDescription>{description}</FormDescription>}
        {warnings && <FormMessageList messages={warnings} type="warning" />}
        {errors && <FormMessageList messages={errors} type="error" />}
      </FormGroup>
    );
  },
);

export const NumberField = withFieldValidation<NumberFieldProps>(
  NumberFieldRaw,
  {
    validations: {
      _isBigInt: validateIsBigInt,
      _numericType: validateNumericType,
    },
  },
);
NumberField.displayName = "NumberField";
