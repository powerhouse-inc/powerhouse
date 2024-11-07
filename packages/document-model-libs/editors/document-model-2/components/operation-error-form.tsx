import { Operation, OperationError } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { Icon } from "@powerhousedao/design-system";
import { TextField } from "./text-field";
import { pascalCase } from "change-case";
import { useRef } from "react";

type Props = {
  handlers: DocumentActionHandlers;
  operation: Operation;
  error?: OperationError;
  focusOnMount?: boolean;
  onSubmit?: () => void;
};

export function OperationErrorForm({
  operation,
  error,
  handlers,
  focusOnMount,
  onSubmit,
}: Props) {
  const textFieldRef = useRef<{ focus: () => void } | null>(null);
  const isEdit = !!error;
  const allOperationErrorNames = operation.errors
    .map((o) => o.name)
    .filter(Boolean);

  const handleSubmit = (name: string) => {
    const formattedName = pascalCase(name);
    if (!formattedName.length) return;

    if (isEdit) {
      handlers.setOperationErrorName(operation.id, error.id, formattedName);
    } else {
      handlers.addOperationError(operation.id, formattedName);
    }
    onSubmit?.();
  };

  return (
    <div className="grid grid-cols-[1fr,auto] gap-1">
      <TextField
        ref={textFieldRef}
        name="name"
        value={error?.name}
        onSubmit={handleSubmit}
        placeholder="Add reducer exception"
        required
        unique={allOperationErrorNames}
        shouldReset
        focusOnMount={focusOnMount}
      />
      {!!error && (
        <button
          tabIndex={-1}
          type="button"
          onClick={() => handlers.deleteOperationError(error.id)}
        >
          <Icon name="Xmark" />
        </button>
      )}
    </div>
  );
}
