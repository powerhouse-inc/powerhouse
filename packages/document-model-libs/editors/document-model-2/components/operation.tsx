import { Module, Operation } from "document-model/document-model";
import { GraphqlEditor } from "./graphql-editor";
import { OperationDescriptionForm } from "./operation-description-form";
import { OperationErrors } from "./operation-errors";
import { OperationForm } from "./operation-form";
import { DocumentActionHandlers } from "../types";

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
    <div key={operation.id}>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <OperationForm
            operation={operation}
            handlers={wrappedHandlers}
            module={module}
            allOperationNames={allOperationNames}
          />
          <div className="pr-7">
            <OperationDescriptionForm
              operation={operation}
              handlers={wrappedHandlers}
              focusOnMount={operation.id === lastCreatedOperationId}
            />
          </div>
        </div>
        <GraphqlEditor
          id={operation.id}
          updateDocumentInModel={(newDoc) =>
            wrappedHandlers.updateOperationSchema(operation.id, newDoc)
          }
        />
        <div className="col-span-1">
          <h3 className="mb-1 mt-2 text-sm font-semibold">
            Reducer Exceptions
          </h3>
          <OperationErrors operation={operation} handlers={wrappedHandlers} />
        </div>
      </div>
    </div>
  );
}
