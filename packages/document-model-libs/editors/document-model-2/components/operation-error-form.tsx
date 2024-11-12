import { Operation, OperationError } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
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
    if (isEdit && name === "") {
      handlers.deleteOperationError(error.id);
      return;
    }

    const formattedName = pascalCase(name);

    if (isEdit) {
      handlers.setOperationErrorName(operation.id, error.id, formattedName);
    } else {
      handlers.addOperationError(operation.id, formattedName);
    }
    onSubmit?.();
  };

  const handleChange = (value: string) => {
    if (isEdit && value === "") {
      handlers.deleteOperation(operation.id);
    }
  };

  return (
    <TextField
      ref={textFieldRef}
      name="name"
      value={error?.name}
      onSubmit={handleSubmit}
      onChange={handleChange}
      placeholder="Add exception"
      required={!isEdit}
      allowEmpty={!isEdit}
      shouldReset={!isEdit}
      unique={allOperationErrorNames}
      focusOnMount={focusOnMount}
    />
  );
}
