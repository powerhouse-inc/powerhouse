import { forwardRef, useId } from "react";
import { Input } from "../fragments/input";
import { FormLabel } from "../fragments/form-label";
import { FormMessageList } from "../fragments/form-message";
import { FormGroup } from "../fragments/form-group";
import { ErrorHandling, FieldCommonProps, NumberProps } from "../types";
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

export interface NumberFieldProps
  extends Omit<
    FieldCommonProps<string | number> &
      NumberProps &
      ErrorHandling &
      Omit<
        React.InputHTMLAttributes<HTMLInputElement>,
        "min" | "max" | "minLength" | "maxLength"
      >,
    "value" | "defaultValue" | "name" | "pattern"
  > {
  className?: string;
  defaultValue?: number;
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
            className={cn(props.disabled && "text-gray-400")}
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
            // text and background style
            "text-gray-900 dark:text-gray-50 dark:bg-[#252A34]  dark:border-[#485265]",
            //Focus state text and placeholder
            "focus:text-gray-300 dark:focus:text-gray-700 placeholder:focus:text-gray-300 dark:placeholder:focus:text-gray-700",
            //Focus state ring style
            "focus-visible:ring-[#9DA6B9] focus-visible:ring-offset-1 dark:ring-offset-[#252A34]",
            //Placeholder
            "placeholder:focus:ml-0.5 placeholder:text-gray-300 dark:placeholder:text-gray-700",
            // Disabled state
            "disabled:border-gray-300 dark:disabled:border-[#373E4D] disabled:bg-[#FFFFFF]dark:disabled:bg-[#252A34] disabled:text-gray-500 dark:disabled:text-gray-700",
            className,
          )}
          pattern={isBigInt ? regex.toString() : pattern?.toString()}
          type={inputType}
          min={minValue}
          max={maxValue}
          aria-valuemin={minValue}
          aria-valuemax={maxValue}
          aria-invalid={!!errors?.length}
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