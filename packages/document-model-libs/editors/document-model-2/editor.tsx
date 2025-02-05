import { useEffect, useRef, useMemo, useCallback } from "react";
import {
    compareStringsWithoutWhitespace,
    initializeModelSchema,
    makeOperationInitialDoc,
    Scope,
} from ".";
import {
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState,
    actions,
} from "document-model/document-model";
import { EditorProps, utils } from "document-model";
import { ModelMetadata } from "./components/model-metadata-form";
import { SchemaContextProvider } from "./context/schema-context";
import { Divider } from "./components/divider";
import { Modules } from "./components/modules";
import { StateSchemas } from "./components/state-schemas";

export default function Editor(
  props: EditorProps<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
  >,
) {
  const { document, documentNodeName, dispatch } = props;
  const {
    name: modelName,
    id: documentType,
    extension,
    description,
    author: { name: authorName, website: authorWebsite },
  } = useMemo(() => document.state.global, [document.state.global]);
  const {
    state: {
      global: {
        schema: globalStateSchema,
        initialValue: globalStateInitialValue,
      },
      local: { schema: localStateSchema, initialValue: localStateInitialValue },
    },
    modules,
  } = useMemo(
    () => document.state.global.specifications[0],
    [document.state.global.specifications[0]],
  );
  const operations = useMemo(
    () => modules.flatMap((module) => module.operations),
    [modules],
  );
  const shouldSetInitialName = useRef(
    !modelName && !!documentNodeName && operations.length === 0,
  );

  useEffect(() => {
    if (!shouldSetInitialName.current || !documentNodeName) return;

    dispatch(actions.setModelName({ name: documentNodeName }));

    // Initialize schema if it's the first time setting the name
    initializeModelSchema({
      modelName: documentNodeName,
      setStateSchema: (schema: string, scope: Scope) => {
        dispatch(actions.setStateSchema({ schema, scope }));
      },
    });

    shouldSetInitialName.current = false;
  }, [documentNodeName]);

  const operationSchemasSdl = useMemo(
    () => operations.flatMap((operation) => operation.schema ?? []).join("\n"),
    [operations],
  );

  const setModelId = useCallback(
    (id: string) => {
      if (compareStringsWithoutWhitespace(id, documentType)) return;
      dispatch(actions.setModelId({ id }));
    },
    [documentType],
  );

  const setModelDescription = useCallback(
    (newDescription: string) => {
      if (compareStringsWithoutWhitespace(newDescription, description)) return;
      dispatch(actions.setModelDescription({ description: newDescription }));
    },
    [description],
  );

  const setModelExtension = useCallback(
    (newExtension: string) => {
      if (compareStringsWithoutWhitespace(newExtension, extension)) return;
      dispatch(actions.setModelExtension({ extension: newExtension }));
    },
    [extension],
  );

  const setModelName = useCallback(
    (newName: string) => {
      if (compareStringsWithoutWhitespace(newName, modelName)) return;
      dispatch(actions.setModelName({ name: newName }));
    },
    [modelName],
  );

  const setAuthorName = useCallback(
    (newAuthorName: string) => {
      if (compareStringsWithoutWhitespace(newAuthorName, authorName)) return;
      dispatch(actions.setAuthorName({ authorName: newAuthorName }));
    },
    [authorName],
  );

  const setAuthorWebsite = useCallback(
    (newAuthorWebsite: string) => {
      if (
        compareStringsWithoutWhitespace(newAuthorWebsite, authorWebsite ?? "")
      )
        return;
      dispatch(actions.setAuthorWebsite({ authorWebsite: newAuthorWebsite }));
    },
    [authorWebsite],
  );

  const setStateSchema = useCallback(
    (newSchema: string, scope: Scope) => {
      const oldSchema =
        scope === "global" ? globalStateSchema : localStateSchema;
      if (compareStringsWithoutWhitespace(newSchema, oldSchema)) return;
      dispatch(actions.setStateSchema({ schema: newSchema, scope }));
    },
    [globalStateSchema, localStateSchema],
  );

  const setInitialState = useCallback(
    (newInitialValue: string, scope: Scope) => {
      const oldInitialValue =
        scope === "global" ? globalStateInitialValue : localStateInitialValue;
      if (compareStringsWithoutWhitespace(newInitialValue, oldInitialValue))
        return;
      dispatch(
        actions.setInitialState({ initialValue: newInitialValue, scope }),
      );
    },
    [globalStateInitialValue, localStateInitialValue],
  );

  const addModule = useCallback(
    (name: string): Promise<string | undefined> => {
      return new Promise((resolve) => {
        try {
          if (
            modules.some((module) =>
              compareStringsWithoutWhitespace(module.name, name),
            )
          ) {
            resolve(undefined);
            return;
          }
          const id = utils.hashKey();
          dispatch(actions.addModule({ id, name }));
          resolve(id);
        } catch (error) {
          console.error("Failed to add module:", error);
          resolve(undefined);
        }
      });
    },
    [modules],
  );

  const updateModuleName = useCallback(
    (id: string, name: string) => {
      if (
        modules.some((module) =>
          compareStringsWithoutWhitespace(module.name, name),
        )
      )
        return;
      dispatch(actions.setModuleName({ id, name }));
    },
    [modules],
  );

  const deleteModule = useCallback(
    (id: string) => dispatch(actions.deleteModule({ id })),
    [],
  );

  const addOperation = useCallback(
    (moduleId: string, name: string): Promise<string | undefined> => {
      return new Promise((resolve) => {
        try {
          const moduleOperationNames =
            modules
              .find((module) => module.id === moduleId)
              ?.operations.map((operation) => operation.name)
              .filter(Boolean) ?? [];
          if (
            moduleOperationNames.some((opName) =>
              compareStringsWithoutWhitespace(opName, name),
            )
          ) {
            resolve(undefined);
            return;
          }
          const id = utils.hashKey();
          dispatch(actions.addOperation({ id, moduleId, name }));
          resolve(id);
        } catch (error) {
          console.error("Failed to add operation:", error);
          resolve(undefined);
        }
      });
    },
    [modules],
  );

  const updateOperationName = useCallback(
    (id: string, name: string) => {
      const operationModule = modules.find((module) =>
        module.operations.some((operation) => operation.id === id),
      );
      const operationNames =
        operationModule?.operations
          .map((operation) => operation.name)
          .filter(Boolean) ?? [];
      if (
        operationNames.some((opName) =>
          compareStringsWithoutWhitespace(opName, name),
        )
      )
        return;
      dispatch(actions.setOperationName({ id, name }));
    },
    [modules],
  );

  const updateOperationSchema = useCallback(
    (id: string, newSchema: string) => {
      const operation = operations.find((operation) => operation.id === id);
      if (
        operation?.schema &&
        compareStringsWithoutWhitespace(newSchema, operation.schema)
      )
        return;
      dispatch(actions.setOperationSchema({ id, schema: newSchema }));
    },
    [operations],
  );

  const setOperationDescription = useCallback(
    (id: string, newDescription: string) => {
      const operationDescription =
        operations.find((operation) => operation.id === id)?.description ?? "";
      if (compareStringsWithoutWhitespace(operationDescription, newDescription))
        return;
      dispatch(
        actions.setOperationDescription({ id, description: newDescription }),
      );
    },
    [operations],
  );

  const deleteOperation = useCallback(
    (id: string) => dispatch(actions.deleteOperation({ id })),
    [],
  );

  const addOperationError = useCallback(
    (operationId: string, errorName: string): Promise<string | undefined> => {
      return new Promise((resolve) => {
        try {
          const operation = operations.find(
            (operation) => operation.id === operationId,
          );
          const operationErrorNames =
            operation?.errors.map((error) => error.name).filter(Boolean) ?? [];
          if (
            operationErrorNames.some((name) =>
              compareStringsWithoutWhitespace(name, errorName),
            )
          ) {
            resolve(undefined);
            return;
          }
          const id = utils.hashKey();
          dispatch(actions.addOperationError({ id, operationId, errorName }));
          resolve(id);
        } catch (error) {
          console.error("Failed to add operation error:", error);
          resolve(undefined);
        }
      });
    },
    [operations],
  );

  const deleteOperationError = useCallback(
    (id: string) => dispatch(actions.deleteOperationError({ id })),
    [],
  );

  const setOperationErrorName = useCallback(
    (operationId: string, errorId: string, errorName: string) => {
      const operation = operations.find(
        (operation) => operation.id === operationId,
      );
      const operationErrorNames =
        operation?.errors.map((error) => error.name).filter(Boolean) ?? [];
      if (
        operationErrorNames.some((name) =>
          compareStringsWithoutWhitespace(name, errorName),
        )
      )
        return;
      dispatch(actions.setOperationErrorName({ id: errorId, errorName }));
    },
    [operations],
  );

  const addOperationAndInitialSchema = useCallback(
    async (moduleId: string, name: string): Promise<string | undefined> => {
      try {
        const id = await addOperation(moduleId, name);
        if (!id) return undefined;
        try {
          updateOperationSchema(id, makeOperationInitialDoc(name));
          return id;
        } catch (error) {
          console.error("Failed to update operation schema:", error);
          return undefined;
        }
      } catch (error) {
        console.error("Failed to add operation and schema:", error);
        return undefined;
      }
    },
    [addOperation, updateOperationSchema],
  );

  return (
    <main className="min-h-dvh bg-gray-50">
      <SchemaContextProvider
        globalStateSchemaSdl={globalStateSchema}
        localStateSchemaSdl={localStateSchema}
        operationSchemasSdl={operationSchemasSdl}
      >
        <div className="mx-auto max-w-6xl px-4 pt-8">
          <ModelMetadata
            name={modelName}
            documentType={documentType}
            extension={extension}
            description={description}
            authorName={authorName}
            authorWebsite={authorWebsite ?? ""}
            globalStateSchema={globalStateSchema}
            localStateSchema={localStateSchema}
            setModelId={setModelId}
            setModelDescription={setModelDescription}
            setModelExtension={setModelExtension}
            setModelName={setModelName}
            setAuthorName={setAuthorName}
            setAuthorWebsite={setAuthorWebsite}
            setStateSchema={setStateSchema}
          />
          <Divider />
          <div>
            <StateSchemas
              modelName={modelName}
              globalStateSchema={globalStateSchema}
              globalStateInitialValue={globalStateInitialValue}
              localStateSchema={localStateSchema}
              localStateInitialValue={localStateInitialValue}
              setStateSchema={setStateSchema}
              setInitialState={setInitialState}
            />
            <Divider />
            <h3 className="mb-6 text-lg">Global Operations</h3>
            <Modules
              modules={modules}
              allOperations={operations}
              addModule={addModule}
              updateModuleName={updateModuleName}
              deleteModule={deleteModule}
              updateOperationName={updateOperationName}
              updateOperationSchema={updateOperationSchema}
              setOperationDescription={setOperationDescription}
              deleteOperation={deleteOperation}
              addOperationError={addOperationError}
              deleteOperationError={deleteOperationError}
              setOperationErrorName={setOperationErrorName}
              addOperationAndInitialSchema={addOperationAndInitialSchema}
            />
          </div>
        </div>
      </SchemaContextProvider>
    </main>
  );
}
