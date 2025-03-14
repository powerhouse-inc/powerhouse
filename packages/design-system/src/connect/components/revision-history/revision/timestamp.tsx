import { Tooltip } from "#connect";
import { format } from "date-fns";

export type TimestampProps = {
  readonly timestamp: number | string;
};

export function Timestamp(props: TimestampProps) {
  const { timestamp } = props;

  const timestampNumber =
    typeof timestamp === "string" && !timestamp.includes("-")
      ? parseInt(timestamp)
      : timestamp;

  const date = new Date(timestampNumber);
  const shortDate = format(date, "HH:mm 'UTC'");
  const longDate = format(date, "eee, dd MMM yyyy HH:mm:ss 'UTC'");
  const tooltipContent = <div>{longDate}</div>;

  return (
    <Tooltip content={tooltipContent}>
      <span className="cursor-pointer text-xs">committed at {shortDate}</span>
    </Tooltip>
  );
}
