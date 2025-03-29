import { RWATableTextInput } from "#rwa";
import { type ComponentPropsWithRef } from "react";
import {
  type Control,
  Controller,
  type ControllerProps,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { NumericFormat } from "react-number-format";
import { twMerge } from "tailwind-merge";

type Props<ControlInputs extends FieldValues> = ComponentPropsWithRef<
  typeof RWATableTextInput
> & {
  readonly name: Path<ControlInputs>;
  readonly control: Control<ControlInputs>;
  readonly disabled?: boolean;
  readonly currency?: "USD";
  readonly numericFormatProps?: ComponentPropsWithRef<typeof NumericFormat>;
  readonly rules?: ControllerProps<ControlInputs>["rules"];
  readonly errorMessage?: string;
  readonly errorMessageClassName?: string;
};

export function RWANumberInput<ControlInputs extends FieldValues>(
  props: Props<ControlInputs>,
) {
  const {
    name,
    control,
    currency,
    rules,
    errorMessage,
    errorMessageClassName,
    numericFormatProps,
    value: _,
    onChange: __,
    ...inputProps
  } = props;

  const {
    allowNegative = false,
    decimalScale = 2,
    thousandSeparator = ",",
    fixedDecimalScale = true,
  } = numericFormatProps ?? {};

  const prefix = currency === "USD" ? "$" : undefined;

  const invalid = props["aria-invalid"] === "true";

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value, ref } }) => (
        <>
          <NumericFormat
            {...inputProps}
            allowNegative={allowNegative}
            customInput={RWATableTextInput}
            decimalScale={decimalScale}
            fixedDecimalScale={fixedDecimalScale}
            getInputRef={ref}
            onValueChange={({ floatValue }) => onChange(floatValue)}
            prefix={prefix}
            thousandSeparator={thousandSeparator}
            value={value}
          />
          {invalid && !!errorMessage ? (
            <p
              className={twMerge("text-sm text-red-900", errorMessageClassName)}
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
        </>
      )}
      rules={rules}
    />
  );
}
