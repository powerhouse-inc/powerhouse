import { Module, Operation } from "document-model/document-model";
import { GraphqlEditor } from "./code-editors/graphql-editor";
import { OperationDescriptionForm } from "./operation-description-form";
import { OperationErrors } from "./operation-errors";
import { OperationForm } from "./operation-form";
import { DocumentActionHandlers } from "../types";
import { ensureValidOperationSchemaInputName } from "../utils/linting";
import { useCallback } from "react";

export type WrappedHandlers = DocumentActionHandlers & {
  addOperationAndInitialSchema: (
    moduleId: string,
    name: string,
  ) => Promise<string | undefined>;
};
type Props = {
  lastCreatedOperationId: string | null;
  operation: Operation;
  module: Module;
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
  } = props;

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
        <GraphqlEditor
          doc={operation.schema ?? ""}
          updateDocumentInModel={handleUpdateDocument}
          customLinter={customLinter}
        />
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
