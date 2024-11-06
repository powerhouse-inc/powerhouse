import { Operation } from "document-model/document-model";
import { DocumentActionHandlers } from "../types";
import { OperationErrorForm } from "./operation-error-form";
import { useId } from "react";

type Props = {
  operation: Operation;
  handlers: DocumentActionHandlers;
};
export function OperationErrors({ operation, handlers }: Props) {
  const addErrorFormId = useId();
  return (
    <ul className="grid list-disc gap-2 pl-4">
      {operation.errors.map((error) => (
        <li key={operation.id}>
          <OperationErrorForm
            error={error}
            operation={operation}
            handlers={handlers}
          />
        </li>
      ))}
      <li className="pr-6">
        <OperationErrorForm
          operation={operation}
          handlers={handlers}
          key={addErrorFormId}
        />
      </li>
    </ul>
  );
}
