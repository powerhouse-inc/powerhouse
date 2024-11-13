import { OperationForm } from "./operation-form";
import { DocumentActionHandlers } from "../types";
import { Module, Operation as TOperation } from "document-model/document-model";
import { useId, useState } from "react";
import { Operation, WrappedHandlers } from "./operation";

type Props = {
  module: Module;
  allOperations: TOperation[];
  handlers: DocumentActionHandlers;
  shouldFocusNewOperation: boolean;
};
export function Operations({
  module,
  handlers,
  allOperations,
  shouldFocusNewOperation,
}: Props) {
  const [lastCreatedOperationId, setLastCreatedOperationId] = useState<
    string | null
  >(null);
  const addOperationFormId = useId();
  const allOperationNames = allOperations.map((o) => o.name).filter(Boolean);

  const wrappedHandlers: WrappedHandlers = {
    ...handlers,
    addOperationAndInitialSchema: async (moduleId: string, name: string) => {
      const operationId = await handlers.addOperationAndInitialSchema(
        moduleId,
        name,
      );
      if (operationId) {
        setLastCreatedOperationId(operationId);
      }
      return operationId;
    },
  };

  return (
    <div>
      {module.operations.map((operation) => (
        <div key={operation.id}>
          <Operation
            operation={operation}
            module={module}
            wrappedHandlers={wrappedHandlers}
            lastCreatedOperationId={lastCreatedOperationId}
            allOperationNames={allOperationNames}
          />
        </div>
      ))}
      <div className="mt-6 w-1/2 pr-6">
        <OperationForm
          key={addOperationFormId}
          handlers={wrappedHandlers}
          module={module}
          allOperationNames={allOperationNames}
          focusOnMount={shouldFocusNewOperation}
        />
      </div>
    </div>
  );
}
