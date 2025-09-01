import { ConnectTooltip, Icon } from "@powerhousedao/design-system";
import { twMerge } from "tailwind-merge";

export type ErrorsProps = {
  readonly errors: string[] | undefined;
};

export function Errors(props: ErrorsProps) {
  const { errors } = props;

  const hasErrors = !!errors?.length;

  const color = hasErrors ? "text-red-800" : "text-green-700";

  const icon = hasErrors ? (
    <Icon name="Exclamation" size={16} />
  ) : (
    <Icon name="Check" size={16} />
  );

  const text = hasErrors ? `Error: ${errors[0]}` : "No errors";

  const content = (
    <span
      className={twMerge(
        "flex w-fit items-center rounded-lg border border-gray-200 px-2 py-1 text-xs",
        color,
        hasErrors && "cursor-pointer",
      )}
    >
      {icon}
      <span className={twMerge("inline-block max-w-36 truncate")}>{text}</span>
    </span>
  );

  const tooltipContent = errors?.map((message, index) => (
    <p className="text-red-800" key={index}>
      Error: {message}
    </p>
  ));

  if (hasErrors) return <ConnectTooltip content={tooltipContent}>{content}</ConnectTooltip>;

  return content;
}
