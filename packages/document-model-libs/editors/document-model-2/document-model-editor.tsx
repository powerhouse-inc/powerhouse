import { typeDefs } from "@powerhousedao/scalars";
import { GraphqlEditor, JSONEditor, ModuleForm } from "./components";
import { OperationForm } from "./components/operation-form";
import { makeMinimalObjectFromSDL, makeInitialSchemaDoc } from "./utils";
import { memo, useState } from "react";
import { DocumentActionHandlers } from "./types";
import { Module } from "document-model/document-model";
import { GraphQLSchema } from "graphql";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/tabs";
import { OperationDescriptionForm } from "./components/operation-description-form";
import { OperationErrorForm } from "./components/operation-error-form";

type Props = {
  modelName: string;
  schema: GraphQLSchema;
  globalStateSchema: string;
  globalStateInitialValue: string;
  localStateSchema: string;
  localStateInitialValue: string;
  handlers: DocumentActionHandlers;
  modules: Module[];
  errors: string;
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
    errors,
  } = props;
  const [showStandardLib, setShowStandardLib] = useState(false);

  if (!globalStateSchema) return null;

  return (
    <div>
      <Tabs defaultValue="global" className="pb-8">
        <div className="mb-10 mt-8 grid grid-cols-3 items-center">
          <div className="h-1 bg-gray-900"></div>
          <TabsList className="flex">
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="local">Local</TabsTrigger>
          </TabsList>
          <div className="h-1 bg-gray-900"></div>
        </div>
        <TabsContent value="global">
          <h2 className="mb-2 text-lg">Global State Schema</h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
              {showStandardLib ? (
                <button
                  tabIndex={-1}
                  className="rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
                  onClick={() => setShowStandardLib(false)}
                >
                  Hide standard library
                </button>
              ) : (
                <button
                  tabIndex={-1}
                  className="rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
                  onClick={() => setShowStandardLib(true)}
                >
                  Show standard library
                </button>
              )}
              {showStandardLib && (
                <GraphqlEditor
                  doc={typeDefs.join("\n")}
                  schema={schema}
                  readonly
                  updateDoc={() => {}}
                />
              )}
              <div className="pt-2">
                <GraphqlEditor
                  doc={globalStateSchema}
                  schema={schema}
                  updateDoc={(newDoc) => {
                    handlers.setStateSchema(newDoc, "global");
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-end justify-between">
                <h3>Initial State</h3>
                <button
                  tabIndex={-1}
                  className="rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
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
              </div>
              <div className="pt-2">
                <JSONEditor
                  schema={schema}
                  doc={globalStateInitialValue}
                  updateDoc={(newDoc) => {
                    handlers.setInitialState(newDoc, "global");
                  }}
                />
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="local">
          {!localStateSchema ? (
            <div className="grid w-full place-items-center pb-8">
              <button
                tabIndex={-1}
                className="mt-2 rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
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
            </div>
          ) : (
            <div>
              <h2 className="mb-2 text-lg">Local State Schema</h2>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  {showStandardLib ? (
                    <button
                      tabIndex={-1}
                      className="rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
                      onClick={() => setShowStandardLib(false)}
                    >
                      Hide standard library
                    </button>
                  ) : (
                    <button
                      tabIndex={-1}
                      className="rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
                      onClick={() => setShowStandardLib(true)}
                    >
                      Show standard library
                    </button>
                  )}
                  {showStandardLib && (
                    <GraphqlEditor
                      doc={typeDefs.join("\n")}
                      schema={schema}
                      readonly
                      updateDoc={() => {}}
                    />
                  )}
                  <div className="pt-2">
                    <GraphqlEditor
                      doc={localStateSchema}
                      schema={schema}
                      updateDoc={(newDoc) => {
                        handlers.setStateSchema(newDoc, "local");
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-end justify-between">
                    <h3>Initial State</h3>
                    <button
                      tabIndex={-1}
                      className="rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
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
                  <div className="pt-2">
                    <JSONEditor
                      schema={schema}
                      doc={localStateInitialValue}
                      updateDoc={(newDoc) => {
                        handlers.setInitialState(newDoc, "local");
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
      <div>
        {errors.split("\n").map((error) => (
          <p className="text-red-900" key={error}>
            {error}
          </p>
        ))}
      </div>
      <div className="my-4 h-1 bg-gray-900"></div>
      <h3 className="text-lg">Global Operations</h3>
      <div className="w-4/5">
        {modules.map((module) => (
          <div className="" key={module.id}>
            <div className="mt-4">
              <ModuleForm key={module.id} handlers={handlers} module={module} />
            </div>
            <div className="">
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
                        <ul className="grid list-disc gap-2 pl-4">
                          {operation.errors.map((error, index) => (
                            <li key={index}>
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
                              key={Math.random().toString()}
                            />
                          </li>
                        </ul>
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
                  key={Math.random().toString()}
                  handlers={handlers}
                  module={module}
                />
              </div>
            </div>
          </div>
        ))}
        <div className="mt-12 pb-12">
          <ModuleForm key={Math.random().toString()} handlers={handlers} />
        </div>
      </div>
    </div>
  );
}

export const DocumentModelEditor = memo(_DocumentModelEditor);
