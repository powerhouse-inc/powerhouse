import { GraphqlEditor } from "./graphql-editor";
import { OperationDescriptionForm } from "./operation-description-form";
import { OperationErrors } from "./operation-errors";
import { OperationForm } from "./operation-form";
import { DocumentActionHandlers } from "../types";
import { Module } from "document-model/document-model";
import { GraphQLSchema } from "graphql";
import { useId } from "react";

type Props = {
  schema: GraphQLSchema;
  module: Module;
  handlers: DocumentActionHandlers;
  isNewModule?: boolean;
};
export function Operations({ schema, module, handlers, isNewModule }: Props) {
  const addOperationFormId = useId();
  return (
    <div>
      {module.operations.map((operation) => (
        <div key={operation.id}>
          <div className="my-4 h-1 bg-gray-900"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <OperationForm
                operation={operation}
                handlers={handlers}
                module={module}
              />
              <div className="pr-7">
                <OperationDescriptionForm
                  operation={operation}
                  handlers={handlers}
                />
              </div>
              <div>
                <h3 className="mb-1 mt-2 text-sm font-semibold">
                  Reducer Exceptions
                </h3>
                <OperationErrors operation={operation} handlers={handlers} />
              </div>
            </div>
            <GraphqlEditor
              schema={schema}
              doc={operation.schema ?? ""}
              updateDoc={(newDoc) =>
                handlers.updateOperationSchema(operation.id, newDoc)
              }
            />
          </div>
        </div>
      ))}
      <div className="mb-4 mt-6 h-1 bg-gray-900"></div>
      <div className="w-1/2 pr-2">
        <OperationForm
          key={addOperationFormId}
          handlers={handlers}
          module={module}
          autoFocus={isNewModule}
        />
      </div>
    </div>
  );
}
