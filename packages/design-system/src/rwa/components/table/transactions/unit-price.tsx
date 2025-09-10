import type { GroupTransactionFormInputs } from "#rwa";
import { calculateUnitPrice, FormattedNumber } from "#rwa";
import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { twMerge } from "tailwind-merge";

export function UnitPrice(props: {
  readonly control: Control<GroupTransactionFormInputs>;
  readonly isViewOnly: boolean;
}) {
  const { control } = props;

  const cashAmount = useWatch({ control, name: "cashAmount" });
  const fixedIncomeAmount = useWatch({ control, name: "fixedIncomeAmount" });

  const unitPrice = calculateUnitPrice(cashAmount, fixedIncomeAmount);

  return (
    <div className={twMerge("mt-1 w-fit", !props.isViewOnly && "ml-auto")}>
      <span className="text-gray-600">Unit Price</span>{" "}
      <span className="text-gray-900">
        <FormattedNumber decimalScale={6} value={unitPrice} />
      </span>
    </div>
  );
}
