import { Icon } from "#design-system";
import { CodePopover } from "../../code-popover.js";
import { FormattedJsonViewer } from "../../formatted-json-viewer.js";
export type OperationProps = {
  readonly operationType: string;
  readonly operationInput: Record<string, any>;
};

export function Operation(props: OperationProps) {
  const { operationType, operationInput } = props;
  return (
    <CodePopover
      content={<FormattedJsonViewer value={operationInput} />}
      trigger={
        <span className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          {operationType}
          <Icon className="text-foreground" name="Braces" size={16} />
        </span>
      }
    />
  );
}
