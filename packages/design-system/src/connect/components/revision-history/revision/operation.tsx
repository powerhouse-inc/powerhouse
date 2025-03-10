import { Tooltip } from "@/connect";
import { Icon } from "#powerhouse";

export type OperationProps = {
  readonly operationType: string;
  readonly operationInput: Record<string, any>;
};

export function Operation(props: OperationProps) {
  const { operationType, operationInput } = props;

  const tooltipContent = (
    <code>
      <pre>{JSON.stringify(operationInput, null, 2)}</pre>
    </code>
  );

  return (
    <Tooltip content={tooltipContent}>
      <span className="flex cursor-pointer items-center gap-2 text-xs">
        {operationType}
        <Icon className="text-gray-300" name="Braces" size={16} />
      </span>
    </Tooltip>
  );
}
