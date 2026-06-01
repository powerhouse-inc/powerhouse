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
        <span className="flex cursor-pointer items-center gap-2 text-xs text-gray-800 dark:text-slate-50">
          {operationType}
          <Icon
            className="text-gray-300 dark:text-slate-600"
            name="Braces"
            size={16}
          />
        </span>
      }
    />
  );
}
