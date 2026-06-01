import { format } from "date-fns";
import { CodePopover } from "../../code-popover.js";
import { FormattedJsonViewer } from "../../formatted-json-viewer.js";

export type TimestampProps = {
  readonly timestampUtcMs: number | string;
};

export function Timestamp(props: TimestampProps) {
  const { timestampUtcMs: timestamp } = props;

  const timestampNumber =
    typeof timestamp === "string" && !timestamp.includes("-")
      ? parseInt(timestamp)
      : timestamp;

  const date = new Date(timestampNumber);
  const shortDate = format(date, "HH:mm 'UTC'");
  const longDate = format(date, "eee, dd MMM yyyy HH:mm:ss 'UTC'");

  return (
    <CodePopover
      content={
        <FormattedJsonViewer
          value={{ timestampFormatted: longDate, timestampUtcMs: timestamp }}
        />
      }
      trigger={
        <span className="cursor-pointer text-xs text-gray-800 dark:text-slate-100">
          committed at {shortDate}
        </span>
      }
    />
  );
}
