import type { Operation, OperationError } from "document-model";
import { pascalCase } from "change-case";
import { useRef, useCallback } from "react";
import { TextField } from "./text-field.js";

type Props = {
  operation: Operation;
  error?: OperationError;
  focusOnMount?: boolean;
  onSubmit?: () => void;
  onAddOperationError: (
    operationId: string,
    errorName: string,
  ) => Promise<string | undefined>;
  deleteOperationError: (id: string) => void;
  setOperationErrorName: (
    operationId: string,
    errorId: string,
    name: string,
  ) => void;
};

export function OperationErrorForm({
  operation,
  error,
  focusOnMount,
  onSubmit,
  onAddOperationError,
  deleteOperationError,
  setOperationErrorName,
}: Props) {
  const textFieldRef = useRef<{ focus: () => void } | null>(null);
  const isEdit = !!error;
  const allOperationErrorNames = operation.errors
    .map((o) => o.name)
    .filter(Boolean);

  const handleSubmit = useCallback(
    (name: string) => {
      if (isEdit && name === "") {
        deleteOperationError(error.id);
        return;
      }

      const formattedName = pascalCase(name);

      if (isEdit) {
        setOperationErrorName(operation.id, error.id, formattedName);
      } else {
        onAddOperationError(operation.id, formattedName);
      }
      onSubmit?.();
    },
    [
      isEdit,
      error?.id,
      operation.id,
      deleteOperationError,
      setOperationErrorName,
      onAddOperationError,
      onSubmit,
    ],
  );

  const handleChange = useCallback(
    (value: string) => {
      if (isEdit && value === "") {
        deleteOperationError(error.id);
      }
    },
    [isEdit, error?.id, deleteOperationError],
  );

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
