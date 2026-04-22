import { Icon } from "#design-system";
import { useState } from "react";
import { ConnectTooltip } from "../../tooltip/tooltip.js";

export type OperationProps = {
  readonly operationType: string;
  readonly operationInput: Record<string, any>;
};

export function Operation(props: OperationProps) {
  const { operationType, operationInput } = props;
  const [copied, setCopied] = useState(false);

  const serialized = JSON.stringify(operationInput, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(serialized);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const tooltipContent = (
    <div className="flex w-max items-start gap-2">
      <pre className="m-0 whitespace-pre font-mono text-xs">{serialized}</pre>
      <button
        aria-label="Copy to clipboard"
        className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        onClick={() => void handleCopy()}
        onPointerDown={(e) => e.stopPropagation()}
        type="button"
      >
        <Icon name={copied ? "Checkmark" : "Copy"} size={14} />
      </button>
    </div>
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
