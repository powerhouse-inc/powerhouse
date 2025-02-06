import { OperationForm } from "./operation-form.js";
import type {
  Module,
  Operation as TOperation,
} from "document-model/document-model";
import { useCallback, useId, useState } from "react";
import { Operation } from "./operation.js";

type Props = {
  module: Module;
  allOperations: TOperation[];
  shouldFocusNewOperation: boolean;
  updateOperationName: (id: string, name: string) => void;
  deleteOperation: (id: string) => void;
  addOperationAndInitialSchema: (
    moduleId: string,
    name: string,
  ) => Promise<string | undefined>;
  updateOperationSchema: (id: string, newDoc: string) => void;
  setOperationDescription: (id: string, description: string) => void;
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
export function Operations({
  module,
  allOperations,
  shouldFocusNewOperation,
  updateOperationName,
  deleteOperation,
  addOperationAndInitialSchema,
  addOperationError,
  deleteOperationError,
  setOperationErrorName,
  updateOperationSchema,
  setOperationDescription,
}: Props) {
  const [lastCreatedOperationId, setLastCreatedOperationId] = useState<
    string | null
  >(null);
  const addOperationFormId = useId();
  const allOperationNames = allOperations.map((o) => o.name).filter(Boolean);

  const onAddOperationAndInitialSchema = useCallback(
    async (moduleId: string, name: string) => {
      const operationId = await addOperationAndInitialSchema(moduleId, name);
      if (operationId) {
        setLastCreatedOperationId(operationId);
      }
      return operationId;
    },
    [addOperationAndInitialSchema, setLastCreatedOperationId],
  );

  return (
    <div>
      {module.operations.map((operation) => (
        <div key={operation.id}>
          <Operation
            operation={operation}
            module={module}
            lastCreatedOperationId={lastCreatedOperationId}
            allOperationNames={allOperationNames}
            addOperationError={addOperationError}
            deleteOperationError={deleteOperationError}
            setOperationErrorName={setOperationErrorName}
            onAddOperationAndInitialSchema={onAddOperationAndInitialSchema}
            updateOperationName={updateOperationName}
            deleteOperation={deleteOperation}
            updateOperationSchema={updateOperationSchema}
            setOperationDescription={setOperationDescription}
          />
        </div>
      ))}
      <div className="mt-6 w-1/2 pr-6">
        <OperationForm
          key={addOperationFormId}
          onAddOperationAndInitialSchema={onAddOperationAndInitialSchema}
          updateOperationName={updateOperationName}
          deleteOperation={deleteOperation}
          module={module}
          allOperationNames={allOperationNames}
          focusOnMount={shouldFocusNewOperation}
        />
      </div>
    </div>
  );
}
