import { type ComponentPropsWithoutRef } from "react";
import { NumericFormat } from "react-number-format";

type Props = Omit<
  ComponentPropsWithoutRef<typeof NumericFormat>,
  "displayType"
> & {
  readonly currency?: "USD";
};

export function FormattedNumber(props: Props) {
  const {
    value,
    currency,
    decimalScale = 2,
    thousandSeparator = ",",
    fixedDecimalScale = true,
  } = props;

  const prefix = currency === "USD" ? "$" : undefined;

  return (
    <NumericFormat
      decimalScale={decimalScale}
      displayType="text"
      fixedDecimalScale={fixedDecimalScale}
      prefix={prefix}
      thousandSeparator={thousandSeparator}
      value={value}
    />
  );
}
