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
            "px-4 text-end text-gray-900 focus:text-gray-300 placeholder:focus:ml-0.5 placeholder:focus:text-gray-300",
            // Disabled state
            "disabled:border-gray-300 bg-[#FFFFFF]",
            className,
          )}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          min={minValue}
          aria-invalid={!!errors?.length}
          max={maxValue}
          autoComplete={autoCompleteValue}
          value={value}
          step={step}
          defaultValue={defaultValue ?? undefined}
          onChange={onChange}
          role="spinbutton"
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
