import React, { FC, useId } from "react";
import {
  AmountProps,
  AmountValue,
  ErrorHandling,
  FieldCommonProps,
  NumberProps,
} from "../types";
import { NumberField } from "../number-field";
import {
  FormDescription,
  FormGroup,
  FormLabel,
  FormMessageList,
} from "../fragments";
import { cn } from "@/scalars/lib/utils";
import { useAmountField } from "./use-amount-field";

export interface AmountFieldProps
  extends Omit<
    FieldCommonProps<string | number> &
      NumberProps &
      ErrorHandling &
      AmountProps &
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
  value?: AmountValue;
}
// TODO: Think about pass reference in here
const AmountField: FC<AmountFieldProps> = ({
  name,
  label,
  value,
  type = "Amount",

  id: propId,
  precision = 0,
  minValue,
  maxValue,
  allowNegative,
  trailingZeros,
  onChange,
  disabled,
  className,
  required,
  errors,
  warnings,
  description,
  defaultValue,
  // TODO: Disable for next iterations in validations
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allowedCurrencies = [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allowedTokens = [],
  ...props
}) => {
  const generatedId = useId();
  const id = propId ?? generatedId;
  const { isPercent, valueToDisplay } = useAmountField({
    type,
    value,
  });

  return (
    <FormGroup>
      {label && (
        <FormLabel
          htmlFor={id}
          required={required}
          disabled={disabled}
          hasError={!!errors?.length}
          className={cn(disabled && "text-gray-400")}
        >
          {label}
        </FormLabel>
      )}
      <div className={cn("relative flex items-center gap-1")}>
        <div className={cn("relative flex items-center")}>
          <NumberField
            defaultValue={defaultValue}
            required={required}
            disabled={disabled}
            name={name}
            id={id}
            value={valueToDisplay}
            maxValue={maxValue}
            precision={precision}
            minValue={minValue}
            allowNegative={allowNegative}
            trailingZeros={trailingZeros}
            onChange={onChange}
            className={cn("flex-1 pr-6 outline-none", className)}
            {...props}
          />
          {isPercent && (
            <span className="pointer-events-none absolute inset-y-0 right-2 ml-2 flex items-center text-gray-900">
              %
            </span>
          )}
        </div>
      </div>
      {description && <FormDescription>{description}</FormDescription>}
      {warnings && <FormMessageList messages={warnings} type="warning" />}
      {errors && <FormMessageList messages={errors} type="error" />}
    </FormGroup>
  );
};

export { AmountField };
