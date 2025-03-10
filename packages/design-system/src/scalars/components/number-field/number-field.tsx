import { Icon } from "#powerhouse";
import { cn } from "#scalars";
import { forwardRef, useId } from "react";
import { FormDescription } from "../fragments/form-description/index.js";
import { FormGroup } from "../fragments/form-group/index.js";
import { FormLabel } from "../fragments/form-label/index.js";
import { FormMessageList } from "../fragments/form-message/index.js";
import { Input } from "../fragments/input/index.js";
import { withFieldValidation } from "../fragments/with-field-validation/index.js";
import { validateNumericType } from "./number-field-validations.js";
import { type InputNumberProps } from "./types.js";
import { useNumberField } from "./use-number-field.js";
import { regex } from "./utils.js";

export interface NumberFieldProps extends InputNumberProps {
  name: string;
  value?: number | bigint;
  defaultValue?: number | bigint;
  className?: string;
  pattern?: RegExp;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
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
      numericType = "Float",
      precision = 0,
      onFocus,
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

      handleFocus,
      buttonRef,
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
      onFocus,
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
            onFocus={handleFocus}
            name={name}
            className={cn("pr-8", className)}
            pattern={isBigInt ? regex.toString() : pattern?.toString()}
            type="text"
            inputMode="numeric"
            role="spinbutton"
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
                aria-label="Increment"
                disabled={canIncrement}
                onMouseDown={(e) => e.preventDefault()}
                type="button"
                onClick={(e) => {
                  stepValueHandler(e, "increment");
                  if (buttonRef.current) {
                    buttonRef.current.focus();
                  }
                }}
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
                aria-label="Decrement"
                onMouseDown={(e) => e.preventDefault()}
                disabled={canDecrement}
                type="button"
                onClick={(e) => {
                  stepValueHandler(e, "decrement");
                  if (buttonRef.current) {
                    buttonRef.current.focus();
                  }
                }}
              >
                <Icon
                  size={10}
                  name="ChevronDown"
                  className={cn(
                    "items-center justify-center text-gray-700 dark:text-gray-300",
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
      _numericType: validateNumericType,
    },
  },
);
NumberField.displayName = "NumberField";
