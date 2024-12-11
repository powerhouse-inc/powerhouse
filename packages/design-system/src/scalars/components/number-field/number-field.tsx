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
import { getDisplayValue, regex } from "./utils";

export interface NumberFieldProps extends InputNumberProps {
  name: string;
  value?: number;
  defaultValue?: number;
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
      trailingZeros = false,
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
    const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
      ["e", "E"].includes(e.key) && e.preventDefault();

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

      const formattedValue = isBigInt
        ? BigInt(newValue)
        : getDisplayValue(newValue.toString(), {
            isBigInt,
            trailingZeros,
            precision,
          });
      const nativeEvent = new Event("change", {
        bubbles: true,
        cancelable: true,
      });

      Object.defineProperty(nativeEvent, "target", {
        value: { value: Number(formattedValue) },
        writable: false,
      });

      onChange?.(nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      let numericValue: number | bigint;
      const inputValue = e.target.value;
      // if its empty, keep it empty
      if (!inputValue || inputValue === "") {
        onBlur?.(e);
        return;
      }

      if (isBigInt) {
        const normalizedValue = inputValue.replace(/[^\d-]/g, "");
        numericValue = BigInt(normalizedValue);
      } else {
        numericValue = Number(value);
      }

      const formattedValue = isBigInt
        ? BigInt(numericValue)
        : getDisplayValue(numericValue.toString(), {
            isBigInt,
            trailingZeros,
            precision,
          });

      const finalValue = isBigInt
        ? BigInt(numericValue)
        : Number(formattedValue);
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
            onKeyDown={blockInvalidChar}
            value={isBigInt ? value?.toString() : value}
            onBlur={handleBlur}
            defaultValue={defaultValue}
            onChange={onChange}
            onPaste={blockInvalidPaste}
            ref={ref}
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
