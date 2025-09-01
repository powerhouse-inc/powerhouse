import { ConnectTooltip, Icon } from "@powerhousedao/design-system";

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
    <ConnectTooltip content={tooltipContent}>
      <span className="flex cursor-pointer items-center gap-2 text-xs">
        {operationType}
        <Icon className="text-gray-300" name="Braces" size={16} />
      </span>
    </ConnectTooltip>
  );
}
