import { Icon } from "#powerhouse";
import { format } from "date-fns";

export function Day(props: { readonly timestamp: string }) {
  const { timestamp } = props;
  const formattedDate = format(timestamp, "MMM dd, yyyy");
  return (
    <h2 className="-ml-6 flex items-center gap-1 bg-slate-50 py-2 text-xs text-slate-100">
      <Icon name="Ring" size={16} /> Changes on {formattedDate}
    </h2>
  );
}
