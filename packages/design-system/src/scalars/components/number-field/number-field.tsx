import { forwardRef, useId } from "react";
import { Input } from "../fragments/input";
import { FormLabel } from "../fragments/form-label";
import { FormMessageList } from "../fragments/form-message";
import { FormGroup } from "../fragments/form-group";
import { InputNumberProps } from "../types";
import { FormDescription } from "../fragments/form-description";
import { cn, dispatchNativeChangeEvent } from "@/scalars/lib";
import { withFieldValidation } from "../fragments/with-field-validation";
import { validateIsBigInt, validatePositive } from "./number-field-validations";
import { Icon } from "@/powerhouse/components/icon";
import { getDisplayValue, regex } from "./utils";

export interface NumberFieldProps extends InputNumberProps {
  name: string;
  value?: string | number;
  defaultValue?: string | number;
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
      maxValue !== undefined && Number(value) >= maxValue;
    const isDecrementDisabled =
      minValue !== undefined && Number(value) <= minValue;

    // Determines the HTML input type based on `isBigInt`: sets to "text" for BigInt values to avoid numeric input constraints,
    // Otherwise sets to "number" for standard numeric input.
    const inputType = isBigInt ? "text" : "number";
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

      let newValue: string | number;

      if (isBigInt) {
        const currentValue = BigInt(value ?? 0);
        const adjustment =
          BigInt(step || 1) *
          (operation === "increment" ? BigInt(1) : BigInt(-1));
        newValue = (currentValue + adjustment).toString(); // Convertir a string para el input
      } else {
        const currentValue = Number(value ?? defaultValue ?? 0);
        const adjustment = (step || 1) * (operation === "increment" ? 1 : -1);
        newValue = currentValue + adjustment;
      }

      // Validación de límites para valores que no sean BigInt
      if (!isBigInt) {
        if (maxValue !== undefined && Number(newValue) > maxValue) return;
        if (minValue !== undefined && Number(newValue) < minValue) return;
      }

      const newEvent = dispatchNativeChangeEvent(newValue, "change");
      onChange?.(newEvent as unknown as React.ChangeEvent<HTMLInputElement>);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const displayValue = getDisplayValue(String(value), {
        isBigInt,
        trailingZeros,
        precision,
      });
      const newEvent = dispatchNativeChangeEvent(displayValue, "change");
      onChange?.(newEvent as unknown as React.ChangeEvent<HTMLInputElement>);
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
            type={inputType}
            min={minValue}
            max={maxValue}
            aria-valuemin={minValue}
            aria-valuemax={maxValue}
            aria-invalid={!!errors?.length}
            onKeyDown={blockInvalidChar}
            value={value}
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
                    "rotate-180 text-gray-700",
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
                    " items-center justify-center text-gray-700",
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
      _positive: validatePositive,
      _isBigInt: validateIsBigInt,
    },
  },
);
NumberField.displayName = "NumberField";
