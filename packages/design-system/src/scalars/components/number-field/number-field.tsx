import { forwardRef, useId } from "react";
import { Input } from "../fragments/input";
import { FormLabel } from "../fragments/form-label";
import { FormMessageList } from "../fragments/form-message";
import { FormGroup } from "../fragments/form-group";
import { InputNumberProps } from "../types";
import { FormDescription } from "../fragments/form-description";
import { cn } from "@/scalars/lib";
import { withFieldValidation } from "../fragments/with-field-validation";
import { validateIsBigInt, validatePositive } from "./number-field-validations";
import { Icon } from "@/powerhouse/components/icon";
import { getDisplayValue, regex } from "./utils";

export interface NumberFieldProps extends InputNumberProps {
  className?: string;
  defaultValue?: number | string;
  name: string;
  pattern?: RegExp;
  value?: number | string;
}

export const NumberFieldRaw = forwardRef<HTMLInputElement, NumberFieldProps>(
  (
    {
      label,
      name,
      description,
      value,
      defaultValue,
      onChange = () => {},
      errors,
      warnings,
      className,
      id: propId,
      minValue,
      maxValue,
      step,
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

    // Determines the HTML input type based on `isBigInt`: sets to "text" for BigInt values to avoid numeric input constraints,
    // Otherwise sets to "number" for standard numeric input.
    const inputType = isBigInt ? "text" : "number";

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

    const displayValue = getDisplayValue(
      value,
      isBigInt,
      trailingZeros,
      precision,
    );
    const handleChange = (
      e: React.MouseEvent<HTMLButtonElement>,
      operation: "increment" | "decrement",
    ) => {
      e.preventDefault();
      const currentValue = Number(displayValue || defaultValue || 0);
      const adjustment = (operation === "increment" ? 1 : -1) * (step || 1);
      let newValue = currentValue + adjustment;

      if (maxValue !== undefined && newValue > maxValue) {
        newValue = maxValue;
      } else if (minValue !== undefined && newValue < minValue) {
        newValue = minValue;
      }

      onChange(newValue as unknown as React.ChangeEvent<HTMLInputElement>);
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
            className={className}
            pattern={isBigInt ? regex.toString() : pattern?.toString()}
            type={inputType}
            min={minValue}
            max={maxValue}
            aria-valuemin={minValue}
            aria-valuemax={maxValue}
            aria-invalid={!!errors?.length}
            onKeyDown={blockInvalidChar}
            value={displayValue}
            defaultValue={defaultValue}
            onChange={onChange}
            step={step}
            onPaste={blockInvalidPaste}
            ref={ref}
            {...props}
          />
          {step && (
            <div className="absolute inset-y-2 right-3 flex flex-col justify-center">
              <button
                type="button"
                onClick={(e) => handleChange(e, "increment")}
              >
                <Icon
                  size={10}
                  name="ChevronDown"
                  className={cn("rotate-180 text-gray-700")}
                />
              </button>
              <button
                type="button"
                onClick={(e) => handleChange(e, "decrement")}
              >
                <Icon
                  size={10}
                  name="ChevronDown"
                  className={cn(" items-center justify-center text-gray-700")}
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

const NumberField = withFieldValidation<NumberFieldProps>(NumberFieldRaw, {
  validations: {
    _positive: validatePositive,
    _isBigInt: validateIsBigInt,
  },
});
NumberField.displayName = "NumberField";

export { NumberField };
