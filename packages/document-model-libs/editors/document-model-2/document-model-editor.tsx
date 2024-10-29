import { typeDefs } from "@powerhousedao/scalars";
import { GraphqlEditor, JSONEditor, ModuleForm } from "./components";
import { OperationForm } from "./components/operation-form";
import { makeMinimalObjectFromSDL, makeInitialSchemaDoc } from "./utils";
import { memo, useState } from "react";
import { DocumentActionHandlers } from "./types";
import { Module } from "document-model/document-model";
import { GraphQLSchema } from "graphql";

type Props = {
  modelName: string;
  schema: GraphQLSchema;
  globalStateSchema: string;
  globalStateInitialValue: string;
  localStateSchema: string;
  localStateInitialValue: string;
  handlers: DocumentActionHandlers;
  modules: Module[];
};
export function _DocumentModelEditor(props: Props) {
  const {
    modelName,
    schema,
    globalStateSchema,
    globalStateInitialValue,
    localStateSchema,
    localStateInitialValue,
    modules,
    handlers,
  } = props;
  const [showStandardLib, setShowStandardLib] = useState(false);

  return (
    <div>
      <div className="mt-4 flex gap-2">
        {!!globalStateSchema && (
          <div>
            {showStandardLib ? (
              <button
                className="rounded bg-gray-800 px-2 py-1 text-white"
                onClick={() => setShowStandardLib(false)}
              >
                Hide standard library
              </button>
            ) : (
              <button
                className="rounded bg-gray-800 px-2 py-1 text-white"
                onClick={() => setShowStandardLib(true)}
              >
                Show standard library
              </button>
            )}
          </div>
        )}
      </div>
      <div>
        {showStandardLib && (
          <GraphqlEditor
            doc={typeDefs.join("\n")}
            schema={schema}
            readonly
            updateDoc={() => {}}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          {!!globalStateSchema && (
            <GraphqlEditor
              doc={globalStateSchema}
              schema={schema}
              updateDoc={(newDoc) => {
                handlers.setStateSchema(newDoc, "global");
              }}
            />
          )}
          <div>
            {!!globalStateInitialValue && (
              <JSONEditor
                schema={schema}
                doc={globalStateInitialValue}
                updateDoc={(newDoc) => {
                  handlers.setInitialState(newDoc, "global");
                }}
              />
            )}
            {!!globalStateSchema && (
              <button
                className="rounded bg-gray-800 px-2 py-1 text-white"
                onClick={() => {
                  const updatedStateDoc = makeMinimalObjectFromSDL(
                    schema,
                    globalStateSchema,
                    JSON.parse(globalStateInitialValue),
                  );
                  handlers.setInitialState(updatedStateDoc, "global");
                }}
              >
                Sync with schema
              </button>
            )}
          </div>
        </div>
        {!localStateSchema && !!globalStateSchema && (
          <button
            className="rounded bg-gray-800 px-2 py-1 text-white"
            onClick={() => {
              const initialDoc = makeInitialSchemaDoc(
                localStateSchema,
                modelName,
                "local",
              );
              handlers.setStateSchema(initialDoc, "local");
              handlers.setInitialState("{}", "local");
            }}
          >
            Add local state
          </button>
        )}
        {!!localStateInitialValue && (
          <div className="grid grid-cols-2 gap-2">
            {!!localStateSchema && (
              <GraphqlEditor
                doc={localStateSchema}
                schema={schema}
                updateDoc={(newDoc) => {
                  handlers.setStateSchema(newDoc, "local");
                }}
              />
            )}
            <div>
              <JSONEditor
                schema={schema}
                doc={localStateInitialValue}
                updateDoc={(newDoc) => {
                  handlers.setInitialState(newDoc, "local");
                }}
              />
              <button
                className="rounded bg-gray-800 px-2 py-1 text-white"
                onClick={() => {
                  const updatedStateDoc = makeMinimalObjectFromSDL(
                    schema,
                    localStateSchema,
                    JSON.parse(localStateInitialValue),
                  );
                  handlers.setInitialState(updatedStateDoc, "local");
                }}
              >
                Sync with schema
              </button>
            </div>
          </div>
        )}
        {!!globalStateSchema && (
          <div>
            {modules.map((module) => (
              <div className="" key={module.id}>
                <div className="mt-4">
                  <ModuleForm
                    key={module.id}
                    handlers={handlers}
                    module={module}
                  />
                </div>
                <div className="mt-4">
                  {module.operations.map((operation) => (
                    <div key={operation.id}>
                      <OperationForm
                        operation={operation}
                        handlers={handlers}
                        module={module}
                      />
                      <GraphqlEditor
                        schema={schema}
                        doc={operation.schema ?? ""}
                        updateDoc={(newDoc) =>
                          handlers.updateOperationSchema(operation.id, newDoc)
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <OperationForm
                    key={Math.random().toString()}
                    handlers={handlers}
                    module={module}
                  />
                </div>
              </div>
            ))}
            <div className="mt-6">
              <ModuleForm key={Math.random().toString()} handlers={handlers} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const DocumentModelEditor = memo(_DocumentModelEditor);
