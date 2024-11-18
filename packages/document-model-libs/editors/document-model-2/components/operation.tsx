import { Module, Operation } from "document-model/document-model";
import { GraphqlEditor } from "./graphql-editor";
import { OperationDescriptionForm } from "./operation-description-form";
import { OperationErrors } from "./operation-errors";
import { OperationForm } from "./operation-form";
import { DocumentActionHandlers } from "../types";
import { ensureValidOperationSchemaInputName } from "../utils/linting";

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
  wrappedHandlers: WrappedHandlers;
  allOperationNames: string[];
};
export function Operation(props: Props) {
  const {
    operation,
    module,
    wrappedHandlers,
    allOperationNames,
    lastCreatedOperationId,
  } = props;
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-12">
      <div className="flex flex-col gap-2">
        <OperationForm
          operation={operation}
          handlers={wrappedHandlers}
          module={module}
          allOperationNames={allOperationNames}
        />
        <OperationDescriptionForm
          operation={operation}
          handlers={wrappedHandlers}
          focusOnMount={operation.id === lastCreatedOperationId}
        />
      </div>

      <div className="relative top-8">
        <GraphqlEditor
          doc={operation.schema ?? ""}
          updateDocumentInModel={(newDoc) =>
            wrappedHandlers.updateOperationSchema(operation.id, newDoc)
          }
          customLinter={(doc) =>
            operation.name
              ? ensureValidOperationSchemaInputName(doc, operation.name)
              : []
          }
        />
      </div>
      <div>
        <h3 className="my-2 text-sm font-medium text-gray-700">
          Reducer Exceptions
        </h3>
        <OperationErrors operation={operation} handlers={wrappedHandlers} />
      </div>
    </div>
  );
}
