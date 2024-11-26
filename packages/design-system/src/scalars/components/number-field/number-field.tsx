import { forwardRef, useId } from "react";
import { Input } from "../fragments/input";
import { FormLabel } from "../fragments/form-label";
import { FormMessageList } from "../fragments/form-message";
import { FormGroup } from "../fragments/form-group";
import { InputNumberProps } from "../types";
import { FormDescription } from "../fragments/form-description";
import { cn } from "@/scalars/lib";
import { getDisplayValue, regex } from "@/scalars/utils/utils";
import { withFieldValidation } from "../fragments/with-field-validation";
import {
  validateDecimalRequired,
  validateIsBigInt,
  validatePositive,
  validatePrecision,
  validateTrailingZeros,
} from "./numberFieldValidations";

export interface NumberFieldProps extends InputNumberProps {
  className?: string;
  defaultValue?: number | string;
  name: string;
  pattern?: RegExp;
  value?: number | string;
}

const NumberFieldRaw = forwardRef<HTMLInputElement, NumberFieldProps>(
  (
    {
      label,
      name,
      description,
      value,
      defaultValue,
      onChange,
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

    // Determines the HTML input type based on `isBigInt`: sets to "text" for BigInt values to avoid numeric input constraints, otherwise sets to "number" for standard numeric input.
    const inputType = isBigInt ? "text" : "number";

    const blockInvalidChar = (e: React.KeyboardEvent<HTMLInputElement>) =>
      ["e", "E"].includes(e.key) && e.preventDefault();

    const displayValue = getDisplayValue(
      value,
      isBigInt,
      trailingZeros,
      precision,
    );

    return (
      <FormGroup>
        {label && (
          <FormLabel
            htmlFor={id}
            required={props.required}
            disabled={props.disabled}
            hasError={!!errors?.length}
          >
            {label}
          </FormLabel>
        )}
        <Input
          id={id}
          name={name}
          className={cn(
            // Allow the arrows step
            step && "show-arrows",
            className,
          )}
          pattern={isBigInt ? regex.toString() : pattern?.toString()}
          type={inputType}
          min={minValue}
          max={maxValue}
          aria-valuemin={minValue}
          aria-valuemax={maxValue}
          aria-invalid={!!errors?.length}
          onKeyDown={blockInvalidChar}
          value={displayValue}
          step={step}
          defaultValue={defaultValue}
          onChange={onChange}
          {...props}
          ref={ref}
        />
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
      _precision: validatePrecision,
      _trailingZeros: validateTrailingZeros,
      _decimalRequired: validateDecimalRequired,
    },
  },
);
