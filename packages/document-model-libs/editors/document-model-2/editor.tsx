import { buildSchema } from "graphql";
import { useState, useEffect, useMemo, useCallback } from "react";
import { initialSchema, hiddenQueryTypeDefDoc } from "./constants";
import {
  GraphqlEditor,
  makeMinimalObjectFromSDL,
  makeOperationInitialDoc,
  makeStateInitialDoc,
  ModuleForm,
  Scope,
} from ".";
import {
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState,
  actions,
} from "document-model/document-model";
import { EditorProps, OperationScope, utils } from "document-model/document";
import { OperationForm } from "./components/operation-form";
import { typeDefs } from "@powerhousedao/scalars";
import { ModelMetadataForm } from "./components/model-metadata-form";

export default function Editor(
  props: EditorProps<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
  >,
) {
  const { document, dispatch } = props;
  const modelName = document.name;
  const hasSetModelMetadata = !!modelName;
  const globalStateSchema =
    document.state.global.specifications[0].state.global.schema;
  const globalStateInitialValue =
    document.state.global.specifications[0].state.global.initialValue;
  const localStateSchema =
    document.state.global.specifications[0].state.local.schema;
  const modules = useMemo(
    () => document.state.global.specifications[0].modules,
    [document.state.global.specifications],
  );
  const operations = useMemo(
    () => modules.flatMap((module) => module.operations),
    [modules],
  );
  const operationSchemas = useMemo(
    () => operations.map((op) => op.schema).filter(Boolean),
    [operations],
  );
  const [schema, setSchema] = useState(initialSchema);
  const [showStandardLib, setShowStandardLib] = useState(false);

  const setModelId = useCallback((id: string) => {
    dispatch(actions.setModelId({ id }));
  }, []);

  const setModuleDescription = useCallback((description: string) => {
    dispatch(actions.setModelDescription({ description }));
  }, []);

  const setModelExtension = useCallback((extension: string) => {
    dispatch(actions.setModelExtension({ extension }));
  }, []);

  const setModelName = useCallback((name: string) => {
    dispatch(actions.setModelName({ name }));
    dispatch(actions.setName(name));
  }, []);

  const setAuthorName = useCallback((authorName: string) => {
    dispatch(actions.setAuthorName({ authorName }));
  }, []);

  const setAuthorWebsite = useCallback((authorWebsite: string) => {
    dispatch(actions.setAuthorWebsite({ authorWebsite }));
  }, []);

  const setStateSchema = useCallback((schema: string, scope: Scope) => {
    dispatch(actions.setStateSchema({ schema, scope }));
  }, []);

  const setInitialState = useCallback((initialValue: string, scope: Scope) => {
    dispatch(actions.setInitialState({ initialValue, scope }));
  }, []);

  const addModule = useCallback((name: string) => {
    dispatch(actions.addModule({ id: utils.hashKey(), name }));
  }, []);

  const updateModuleName = useCallback((id: string, name: string) => {
    dispatch(actions.setModuleName({ id, name }));
  }, []);

  const updateModuleDescription = useCallback(
    (id: string, description: string) => {
      dispatch(actions.setModuleDescription({ id, description }));
    },
    [],
  );

  const deleteModule = useCallback((id: string) => {
    dispatch(actions.deleteModule({ id }));
  }, []);

  const addOperation = useCallback((moduleId: string, name: string) => {
    dispatch(actions.addOperation({ id: utils.hashKey(), moduleId, name }));
  }, []);

  const updateOperationName = useCallback((id: string, name: string) => {
    dispatch(actions.setOperationName({ id, name }));
  }, []);

  const updateOperationSchema = useCallback((id: string, schema: string) => {
    dispatch(actions.setOperationSchema({ id, schema }));
  }, []);

  const updateOperationScope = useCallback(
    (id: string, scope: OperationScope) => {
      dispatch(actions.setOperationScope({ id, scope }));
    },
    [],
  );

  const deleteOperation = useCallback((id: string) => {
    dispatch(actions.deleteOperation({ id }));
  }, []);

  const handlers = useMemo(
    () => ({
      setModelId,
      setModelExtension,
      setModelName,
      setAuthorName,
      setAuthorWebsite,
      setStateSchema,
      setInitialState,
      addModule,
      setModuleDescription,
      updateModuleName,
      updateModuleDescription,
      deleteModule,
      addOperation,
      updateOperationName,
      updateOperationSchema,
      updateOperationScope,
      deleteOperation,
    }),
    [
      setModelId,
      setModelExtension,
      setModelName,
      setAuthorName,
      setAuthorWebsite,
      setStateSchema,
      setInitialState,
      addModule,
      setModuleDescription,
      updateModuleName,
      updateModuleDescription,
      deleteModule,
      addOperation,
      updateOperationName,
      updateOperationSchema,
      updateOperationScope,
      deleteOperation,
    ],
  );

  useEffect(() => {
    const newSchemaString = `
      ${hiddenQueryTypeDefDoc}
      ${globalStateSchema}
      ${localStateSchema}
      ${operationSchemas.join("\n")}
    `;
    if (!newSchemaString) return;
    const newSchema = buildSchema(newSchemaString);
    setSchema(newSchema);
  }, [globalStateSchema, localStateSchema, modules]);

  return (
    <main className="mx-auto min-h-dvh max-w-screen-xl px-4 pt-8">
      {!hasSetModelMetadata ? (
        <ModelMetadataForm document={document} handlers={handlers} />
      ) : (
        <div>
          <div className="mt-4 flex gap-2">
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
          <div>
            {showStandardLib && (
              <GraphqlEditor
                doc={typeDefs.join("\n")}
                schema={schema}
                readonly
                updateDoc={() => {}}
              />
            )}
            <GraphqlEditor
              doc={makeStateInitialDoc(globalStateSchema, modelName, "global")}
              schema={schema}
              updateDoc={(newDoc) => {
                handlers.setStateSchema(newDoc, "global");
                handlers.setInitialState(
                  makeMinimalObjectFromSDL(schema, newDoc),
                  "global",
                );
              }}
            />
            {!localStateSchema && (
              <button
                className="rounded bg-gray-800 px-2 py-1 text-white"
                onClick={() => {
                  const initialDoc = makeStateInitialDoc(
                    localStateSchema,
                    modelName,
                    "local",
                  );
                  handlers.setStateSchema(initialDoc, "local");
                }}
              >
                Add local state
              </button>
            )}
            {!!localStateSchema && (
              <GraphqlEditor
                doc={localStateSchema}
                schema={schema}
                updateDoc={(newDoc) => {
                  handlers.setStateSchema(newDoc, "local");
                  handlers.setInitialState(
                    makeMinimalObjectFromSDL(schema, newDoc),
                    "local",
                  );
                }}
              />
            )}
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
                        doc={makeOperationInitialDoc(operation)}
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
        </div>
      )}
    </main>
  );
}
