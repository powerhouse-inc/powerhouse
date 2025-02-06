import type { Operation } from "document-model/document-model";
import { useCallback, useId, useState } from "react";
import { OperationErrorForm } from "./operation-error-form.js";

type Props = {
  operation: Operation;
  addOperationError: (
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

export function OperationErrors({
  operation,
  addOperationError,
  deleteOperationError,
  setOperationErrorName,
}: Props) {
  const addErrorFormId = useId();
  const [shouldFocusAddForm, setShouldFocusAddForm] = useState(false);

  const onAddOperationError = useCallback(
    async (operationId: string, error: string) => {
      const errorId = await addOperationError(operationId, error);
      if (errorId) {
        setShouldFocusAddForm(true);
      }
      return errorId;
    },
    [addOperationError, setShouldFocusAddForm],
  );

  const onAddOperationErrorSubmit = useCallback(
    () => setShouldFocusAddForm(false),
    [setShouldFocusAddForm],
  );

  return (
    <ul className="ml-4 list-disc">
      {operation.errors.map((error) => (
        <li key={error.id}>
          <OperationErrorForm
            error={error}
            operation={operation}
            onAddOperationError={onAddOperationError}
            deleteOperationError={deleteOperationError}
            setOperationErrorName={setOperationErrorName}
          />
        </li>
      ))}
      <li>
        <OperationErrorForm
          operation={operation}
          onAddOperationError={onAddOperationError}
          deleteOperationError={deleteOperationError}
          setOperationErrorName={setOperationErrorName}
          key={`${addErrorFormId}-${shouldFocusAddForm}`}
          focusOnMount={shouldFocusAddForm}
          onSubmit={onAddOperationErrorSubmit}
        />
      </li>
    </ul>
  );
}
