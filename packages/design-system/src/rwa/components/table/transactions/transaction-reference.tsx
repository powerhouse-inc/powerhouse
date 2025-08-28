import {
  getIsTransaction,
  type GroupTransactionFormInputs,
  RWATableTextInput,
  Tooltip,
  TooltipProvider,
} from "@powerhousedao/design-system";
import {
  type ComponentPropsWithRef,
  type ForwardedRef,
  forwardRef,
} from "react";
import { type Control, useWatch } from "react-hook-form";

export const TransactionReference = forwardRef(function TransactionReference(
  props: ComponentPropsWithRef<typeof RWATableTextInput> & {
    readonly control: Control<GroupTransactionFormInputs>;
  },
  ref: ForwardedRef<HTMLInputElement>,
) {
  const { control, disabled } = props;
  const value = useWatch({ control, name: "txRef" });
  const maxLength = 46;
  const shouldShortenValue =
    typeof value === "string" && value.length >= maxLength;
  const maybeShortenedValue = shouldShortenValue
    ? `${value.slice(0, maxLength)}...`
    : value;
  const isTransaction = getIsTransaction(value);

  const tooltipContent = (
    <div>
      <p>{value}</p>
      {isTransaction ? (
        <p className="mt-2 text-center">
          <a
            className="text-blue-900 underline"
            href={`https://etherscan.io/tx/${value}`}
          >
            View on Etherscan
          </a>
        </p>
      ) : null}
    </div>
  );

  if (disabled)
    return (
      <TooltipProvider>
        <Tooltip content={tooltipContent}>
          <span>{maybeShortenedValue}</span>
        </Tooltip>
      </TooltipProvider>
    );

  return <RWATableTextInput {...props} ref={ref} />;
});
