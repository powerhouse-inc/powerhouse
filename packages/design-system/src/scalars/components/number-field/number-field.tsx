import { forwardRef, useId } from "react";
import { Input } from "../fragments/input";
import { FormLabel } from "../fragments/form-label";
import { FormMessageList } from "../fragments/form-message";
import { FormGroup } from "../fragments/form-group";
import { FormDescription } from "../fragments/form-description";
import { cn } from "@/scalars/lib";
import { withFieldValidation } from "../fragments/with-field-validation";
import {
  validateIsBigInt,
  validateNumericType,
} from "./number-field-validations";
import { Icon } from "@/powerhouse/components/icon";
import { regex } from "./utils";
import { InputNumberProps } from "./types";
import { useNumberField } from "./use-number-field";

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
      trailingZeros = false,
      numericType,
      precision = 0,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = propId ?? generatedId;
    const {
      canIncrement,
      canDecrement,
      showSteps,
      preventInvalidCharsAndHandleArrows,
      stepValueHandler,
      blockInvalidPaste,
      preventLetterInput,
      isBigInt,
      handleBlur,
    } = useNumberField({
      value,
      maxValue,
      minValue,
      step,
      onChange,
      numericType,
      onBlur,
      trailingZeros,
      precision,
    });

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
              preventLetterInput(e);
              preventInvalidCharsAndHandleArrows(e);
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
                disabled={canIncrement}
                type="button"
                onClick={(e) => stepValueHandler(e, "increment")}
              >
                <Icon
                  size={10}
                  name="ChevronDown"
                  className={cn(
                    "rotate-180 text-gray-700 dark:text-gray-300",
                    canIncrement && "cursor-not-allowed",
                  )}
                />
              </button>
              <button
                disabled={canDecrement}
                type="button"
                onClick={(e) => stepValueHandler(e, "decrement")}
              >
                <Icon
                  size={10}
                  name="ChevronDown"
                  className={cn(
                    " items-center justify-center text-gray-700 dark:text-gray-300",
                    canDecrement && "cursor-not-allowed",
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
