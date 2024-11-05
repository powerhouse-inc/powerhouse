import { forwardRef, useId } from "react";
import { Input } from "../input";
import { FormLabel } from "../form-label";
import { FormMessageList } from "../form-message";
import { FormGroup } from "../form-group";
import { ErrorHandling, FieldCommonProps, IntNumberProps } from "../../types";
import { FormDescription } from "../form-description";
import { cn } from "@/scalars/lib";

export interface NumberFieldProps
  extends Omit<
    FieldCommonProps<string> &
      IntNumberProps &
      ErrorHandling &
      React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "autoComplete" | "defaultValue"
  > {
  value?: number;
  className?: string;
  autoComplete?: boolean;
  defaultValue?: number;
  allowNegative?: boolean;
}

export const IntField = forwardRef<HTMLInputElement, NumberFieldProps>(
  (
    {
      label,
      description,
      value,
      defaultValue,
      onChange,
      errors,
      warnings,
      className,
      autoComplete,
      id: propId,
      minValue,
      maxValue,
      step,
      //TODO: disabled by validation and improve those props
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      allowNegative = true,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      isBigInt,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = propId ?? generatedId;
    const autoCompleteValue =
      autoComplete === undefined ? undefined : autoComplete ? "on" : "off";

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
          className={cn(
            // text and background style
            "text-end text-gray-900 dark:text-gray-50 dark:bg-[#252A34]  dark:border-[#485265]",
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
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={minValue}
          aria-invalid={!!errors?.length}
          max={maxValue}
          autoComplete={autoCompleteValue}
          aria-valuemin={minValue}
          aria-valuemax={maxValue}
          value={value}
          step={step}
          defaultValue={defaultValue ?? undefined}
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
