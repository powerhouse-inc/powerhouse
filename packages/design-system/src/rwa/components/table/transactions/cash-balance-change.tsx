import { type GroupTransactionFormInputs } from "@/rwa/types";
import { calculateCashBalanceChange } from "@/rwa/utils";
import { type Control, useWatch } from "react-hook-form";
import { FormattedNumber } from "../base";

export function CashBalanceChange(props: {
  readonly control: Control<GroupTransactionFormInputs>;
}) {
  const { control } = props;
  const cashAmount = useWatch({ control, name: "cashAmount" });
  const type = useWatch({ control, name: "type" });
  const fees = useWatch({ control, name: "fees" });

  const cashBalanceChange = calculateCashBalanceChange(type, cashAmount, fees);

  return (
    <div className="flex items-center justify-between border-t border-gray-300 bg-gray-100 p-3 font-semibold text-gray-800">
      <div className="mr-6 text-sm text-gray-600">Cash Balance Change $USD</div>
      <div className="h-px flex-1 border-b border-dashed border-gray-400" />
      <div className="pl-8 text-sm text-gray-900">
        <FormattedNumber value={cashBalanceChange} />
      </div>
    </div>
  );
}
