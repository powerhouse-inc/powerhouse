import {
  addModule,
  addOperation,
  addOperationError,
  deleteModule,
  deleteOperation,
  deleteOperationError,
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
  EditorProps, hashKey,
  setAuthorName,
  setAuthorWebsite,
  setInitialState,
  setModelDescription,
  setModelExtension,
  setModelId,
  setModelName,
  setModuleName,
  setOperationDescription,
  setOperationErrorName,
  setOperationName,
  setOperationSchema,
  setStateSchema,
} from "document-model";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Divider } from "./components/divider.js";
import { ModelMetadata } from "./components/model-metadata-form.js";
import { Modules } from "./components/modules.js";
import { StateSchemas } from "./components/state-schemas.js";
import { SchemaContextProvider } from "./context/schema-context.js";
import { Scope } from "./types/documents.js";
import {
  compareStringsWithoutWhitespace,
  initializeModelSchema,
  makeOperationInitialDoc,
} from "./utils/helpers.js";

export function DocumentModelEditor(
  props: EditorProps<
    DocumentModelState,
    DocumentModelLocalState,
    DocumentModelAction
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

    dispatch(setModelName({ name: documentNodeName }));

    // Initialize schema if it's the first time setting the name
    initializeModelSchema({
      modelName: documentNodeName,
      setStateSchema: (schema: string, scope: Scope) => {
        dispatch(setStateSchema({ schema, scope }));
      },
    });

    shouldSetInitialName.current = false;
  }, [documentNodeName]);

  const operationSchemasSdl = useMemo(
    () => operations.flatMap((operation) => operation.schema ?? []).join("\n"),
    [operations],
  );

  const handleSetModelId = useCallback(
    (id: string) => {
      if (compareStringsWithoutWhitespace(id, documentType)) return;
      dispatch(setModelId({ id }));
    },
    [documentType],
  );

  const handleSetModelDescription = useCallback(
    (newDescription: string) => {
      if (compareStringsWithoutWhitespace(newDescription, description)) return;
      dispatch(setModelDescription({ description: newDescription }));
    },
    [description],
  );

  const handleSetModelExtension = useCallback(
    (newExtension: string) => {
      if (compareStringsWithoutWhitespace(newExtension, extension)) return;
      dispatch(setModelExtension({ extension: newExtension }));
    },
    [extension],
  );

  const handleSetModelName = useCallback(
    (newName: string) => {
      if (compareStringsWithoutWhitespace(newName, modelName)) return;
      dispatch(setModelName({ name: newName }));
    },
    [modelName],
  );

  const handleSetAuthorName = useCallback(
    (newAuthorName: string) => {
      if (compareStringsWithoutWhitespace(newAuthorName, authorName)) return;
      dispatch(setAuthorName({ authorName: newAuthorName }));
    },
    [authorName],
  );

  const handleSetAuthorWebsite = useCallback(
    (newAuthorWebsite: string) => {
      if (
        compareStringsWithoutWhitespace(newAuthorWebsite, authorWebsite ?? "")
      )
        return;
      dispatch(setAuthorWebsite({ authorWebsite: newAuthorWebsite }));
    },
    [authorWebsite],
  );

  const handleSetStateSchema = useCallback(
    (newSchema: string, scope: Scope) => {
      const oldSchema =
        scope === "global" ? globalStateSchema : localStateSchema;
      if (compareStringsWithoutWhitespace(newSchema, oldSchema)) return;
      dispatch(setStateSchema({ schema: newSchema, scope }));
    },
    [globalStateSchema, localStateSchema],
  );

  const handleSetInitialState = useCallback(
    (newInitialValue: string, scope: Scope) => {
      const oldInitialValue =
        scope === "global" ? globalStateInitialValue : localStateInitialValue;
      if (compareStringsWithoutWhitespace(newInitialValue, oldInitialValue))
        return;
      dispatch(setInitialState({ initialValue: newInitialValue, scope }));
    },
    [globalStateInitialValue, localStateInitialValue],
  );

  const handleAddModule = useCallback(
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
          const id = hashKey();
          dispatch(addModule({ id, name }));
          resolve(id);
        } catch (error) {
          console.error("Failed to add module:", error);
          resolve(undefined);
        }
      });
    },
    [modules],
  );

  const handleSetModuleName = useCallback(
    (id: string, name: string) => {
      if (
        modules.some((module) =>
          compareStringsWithoutWhitespace(module.name, name),
        )
      )
        return;
      dispatch(setModuleName({ id, name }));
    },
    [modules],
  );

  const handleDeleteModule = useCallback(
    (id: string) => dispatch(deleteModule({ id })),
    [],
  );

  const handleAddOperation = useCallback(
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
          const id = hashKey();
          dispatch(addOperation({ id, moduleId, name }));
          resolve(id);
        } catch (error) {
          console.error("Failed to add operation:", error);
          resolve(undefined);
        }
      });
    },
    [modules],
  );

  const handleSetOperationName = useCallback(
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
      dispatch(setOperationName({ id, name }));
    },
    [modules],
  );

  const handleSetOperationSchema = useCallback(
    (id: string, newSchema: string) => {
      const operation = operations.find((operation) => operation.id === id);
      if (
        operation?.schema &&
        compareStringsWithoutWhitespace(newSchema, operation.schema)
      )
        return;
      dispatch(setOperationSchema({ id, schema: newSchema }));
    },
    [operations],
  );

  const handleSetOperationDescription = useCallback(
    (id: string, newDescription: string) => {
      const operationDescription =
        operations.find((operation) => operation.id === id)?.description ?? "";
      if (compareStringsWithoutWhitespace(operationDescription, newDescription))
        return;
      dispatch(setOperationDescription({ id, description: newDescription }));
    },
    [operations],
  );

  const handleDeleteOperation = useCallback(
    (id: string) => dispatch(deleteOperation({ id })),
    [],
  );

  const handleAddOperationError = useCallback(
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
          const id = hashKey();
          dispatch(addOperationError({ id, operationId, errorName }));
          resolve(id);
        } catch (error) {
          console.error("Failed to add operation error:", error);
          resolve(undefined);
        }
      });
    },
    [operations],
  );

  const handleDeleteOperationError = useCallback(
    (id: string) => dispatch(deleteOperationError({ id })),
    [],
  );

  const handleSetOperationErrorName = useCallback(
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
      dispatch(setOperationErrorName({ id: errorId, errorName }));
    },
    [operations],
  );

  const addOperationAndInitialSchema = useCallback(
    async (moduleId: string, name: string): Promise<string | undefined> => {
      try {
        const id = await handleAddOperation(moduleId, name);
        if (!id) return undefined;
        try {
          handleSetOperationSchema(id, makeOperationInitialDoc(name));
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
    [handleAddOperation, handleSetOperationSchema],
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
            setModelId={handleSetModelId}
            setModelDescription={handleSetModelDescription}
            setModelExtension={handleSetModelExtension}
            setModelName={handleSetModelName}
            setAuthorName={handleSetAuthorName}
            setAuthorWebsite={handleSetAuthorWebsite}
            setStateSchema={handleSetStateSchema}
          />
          <Divider />
          <div>
            <StateSchemas
              modelName={modelName}
              globalStateSchema={globalStateSchema}
              globalStateInitialValue={globalStateInitialValue}
              localStateSchema={localStateSchema}
              localStateInitialValue={localStateInitialValue}
              setStateSchema={handleSetStateSchema}
              setInitialState={handleSetInitialState}
            />
            <Divider />
            <h3 className="mb-6 text-lg">Global Operations</h3>
            <Modules
              modules={modules}
              allOperations={operations}
              addModule={handleAddModule}
              updateModuleName={handleSetModuleName}
              deleteModule={handleDeleteModule}
              updateOperationName={handleSetOperationName}
              updateOperationSchema={handleSetOperationSchema}
              setOperationDescription={handleSetOperationDescription}
              deleteOperation={handleDeleteOperation}
              addOperationError={handleAddOperationError}
              deleteOperationError={handleDeleteOperationError}
              setOperationErrorName={handleSetOperationErrorName}
              addOperationAndInitialSchema={addOperationAndInitialSchema}
            />
          </div>
        </div>
      </SchemaContextProvider>
    </main>
  );
}
