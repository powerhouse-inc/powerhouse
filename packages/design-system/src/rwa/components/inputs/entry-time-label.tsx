import { type GroupTransactionFormInputs } from "@/rwa/types";
import { formatDateForDisplay } from "@/rwa/utils";
import { type Control, useWatch } from "react-hook-form";

export function EntryTimeLabel({
  control,
}: {
  control: Control<GroupTransactionFormInputs>;
}) {
  const value = useWatch({ control, name: "entryTime" });
  return value ? formatDateForDisplay(new Date(value), true, true) : null;
}
