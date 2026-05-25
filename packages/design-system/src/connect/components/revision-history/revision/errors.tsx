import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";
import { CodePopover } from "../../code-popover.js";
import { FormattedJsonViewer } from "../../formatted-json-viewer.js";

export type ErrorsProps = {
  readonly errors: string[] | undefined;
};

export function Errors(props: ErrorsProps) {
  const { errors } = props;

  const hasErrors = !!errors?.length;

  const color = hasErrors
    ? "text-red-800 dark:text-red-100"
    : "text-green-700 dark:text-green-100";

  const icon = hasErrors ? (
    <Icon name="Exclamation" size={16} />
  ) : (
    <Icon name="Check" size={16} />
  );

  const text = hasErrors ? `Error: ${errors[0]}` : "No errors";

  const content = (
    <span
      className={twMerge(
        "flex w-fit items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-slate-500 dark:bg-slate-800",
        color,
        hasErrors && "cursor-pointer",
      )}
    >
      {icon}
      <span className={twMerge("inline-block max-w-36 truncate")}>{text}</span>
    </span>
  );

  if (hasErrors)
    return (
      <CodePopover
        content={<FormattedJsonViewer value={errors} />}
        trigger={content}
      />
    );

  return content;
}
