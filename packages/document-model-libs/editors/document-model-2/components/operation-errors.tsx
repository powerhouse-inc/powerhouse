import { Operation } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { OperationErrorForm } from "./operation-error-form";
import { useId, useState, useEffect } from "react";

type Props = {
  operation: Operation;
  handlers: DocumentActionHandlers;
};

export function OperationErrors({ operation, handlers }: Props) {
  const addErrorFormId = useId();
  const [shouldFocusAddForm, setShouldFocusAddForm] = useState(false);

  const wrappedHandlers = {
    ...handlers,
    addOperationError: async (operationId: string, error: string) => {
      const errorId = await handlers.addOperationError(operationId, error);
      if (errorId) {
        setShouldFocusAddForm(true);
      }
      return errorId;
    },
  };

  return (
    <ul className="grid list-disc gap-2 pl-4">
      {operation.errors.map((error) => (
        <li key={error.id}>
          <OperationErrorForm
            error={error}
            operation={operation}
            handlers={wrappedHandlers}
          />
        </li>
      ))}
      <li className="pr-6">
        <OperationErrorForm
          operation={operation}
          handlers={wrappedHandlers}
          key={`${addErrorFormId}-${shouldFocusAddForm}`}
          focusOnMount={shouldFocusAddForm}
          onSubmit={() => setShouldFocusAddForm(false)}
        />
      </li>
    </ul>
  );
}
