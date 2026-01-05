import type { ModuleSpecification } from "document-model";
import { lazy, useCallback } from "react";
import type { DocumentActionHandlers } from "../types/documents.js";
import { isEmptyOperationSchema } from "../utils/helpers.js";
import { ensureValidOperationSchemaInputName } from "../utils/linting.js";
import { OperationDescriptionForm } from "./operation-description-form.js";
import { OperationErrors } from "./operation-errors.js";
import { OperationForm } from "./operation-form.js";
const GraphqlEditor = lazy(() => import("./code-editors/graphql-editor.js"));
export type WrappedHandlers = DocumentActionHandlers & {
  addOperationAndInitialSchema: (
    moduleId: string,
    name: string,
  ) => Promise<string | undefined>;
};
type Props = {
  lastCreatedOperationId: string | null;
  operation: ModuleSpecification["operations"][number];
  module: ModuleSpecification;
  allOperationNames: string[];
  onAddOperationAndInitialSchema: (
    moduleId: string,
    name: string,
  ) => Promise<string | undefined>;
  updateOperationName: (id: string, name: string) => void;
  deleteOperation: (id: string) => void;
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
  toggleNoInputRequired: (id: string, noInputRequired: boolean) => void;
};
export function Operation(props: Props) {
  const {
    operation,
    module,
    allOperationNames,
    lastCreatedOperationId,
    onAddOperationAndInitialSchema,
    updateOperationName,
    deleteOperation,
    updateOperationSchema,
    setOperationDescription,
    addOperationError,
    deleteOperationError,
    setOperationErrorName,
    toggleNoInputRequired,
  } = props;

  const noInputRequired = isEmptyOperationSchema(operation.schema);

  const handleToggleNoInput = useCallback(
    (checked: boolean) => toggleNoInputRequired(operation.id, checked),
    [operation.id, toggleNoInputRequired],
  );

  const handleUpdateDocument = useCallback(
    (newDoc: string) => updateOperationSchema(operation.id, newDoc),
    [operation.id, updateOperationSchema],
  );

  const customLinter = useCallback(
    (doc: string) =>
      operation.name
        ? ensureValidOperationSchemaInputName(doc, operation.name)
        : [],
    [operation.name],
  );

  return (
    <div
      className="mt-4 grid grid-cols-2 gap-x-12"
      style={{
        gridTemplateAreas: `
        "left editor"
        "errors editor"
      `,
        gridTemplateRows: "auto 1fr",
      }}
    >
      <div className="flex flex-col gap-2" style={{ gridArea: "left" }}>
        <OperationForm
          operation={operation}
          onAddOperationAndInitialSchema={onAddOperationAndInitialSchema}
          updateOperationName={updateOperationName}
          deleteOperation={deleteOperation}
          module={module}
          allOperationNames={allOperationNames}
        />
        <OperationDescriptionForm
          operation={operation}
          focusOnMount={operation.id === lastCreatedOperationId}
          setOperationDescription={setOperationDescription}
        />
      </div>

      <div className="relative top-8" style={{ gridArea: "editor" }}>
        <label className="mb-2 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={noInputRequired}
            onChange={(e) => handleToggleNoInput(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">
            Operation with no inputs
          </span>
        </label>
        {!noInputRequired && (
          <GraphqlEditor
            doc={operation.schema ?? ""}
            updateDocumentInModel={handleUpdateDocument}
            customLinter={customLinter}
          />
        )}
      </div>

      <div style={{ gridArea: "errors" }}>
        <h3 className="my-2 text-sm font-medium text-gray-700">
          Reducer Exceptions
        </h3>
        <OperationErrors
          operation={operation}
          addOperationError={addOperationError}
          deleteOperationError={deleteOperationError}
          setOperationErrorName={setOperationErrorName}
        />
      </div>
    </div>
  );
}
