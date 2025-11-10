import type { Control } from "react-hook-form";
import { useWatch } from "react-hook-form";
import type { GroupTransactionFormInputs } from "../types.js";
import { formatDateForDisplay } from "../utils/date.js";

export function EntryTimeLabel({
  control,
}: {
  control: Control<GroupTransactionFormInputs>;
}) {
  const value = useWatch({ control, name: "entryTime" });
  return value ? formatDateForDisplay(new Date(value), true, true) : null;
}
