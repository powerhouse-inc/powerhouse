import type { DocumentModelDocument, EditorProps } from "document-model";
import {
  addModule,
  addOperation,
  addOperationError,
  deleteModule,
  deleteOperation,
  deleteOperationError,
  generateId,
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
import { useEffect, useRef } from "react";
import { Divider } from "./components/divider.js";
import { ModelMetadata } from "./components/model-metadata-form.js";
import { Modules } from "./components/modules.js";
import { StateSchemas } from "./components/state-schemas.js";
import { SchemaContextProvider } from "./context/schema-context.js";
import type { Scope } from "./types/documents.js";
import {
  compareStringsWithoutWhitespace,
  initializeModelSchema,
  makeOperationInitialDoc,
} from "./utils/helpers.js";
import { pascalCase } from "change-case";
import { useDocumentById } from "@powerhousedao/reactor-browser";

export function DocumentModelEditor(props: EditorProps) {
  const { document: initialDocument } = props;
  const [unsafeDocument, dispatch] = useDocumentById(initialDocument.header.id);
  const document = unsafeDocument as DocumentModelDocument;

  const documentNodeName = document.header.name;
  const {
    name: modelName,
    id: documentType,
    extension,
    description,
    author: { name: authorName, website: authorWebsite },
  } = document.state.global;
  const {
    state: {
      global: {
        schema: globalStateSchema,
        initialValue: globalStateInitialValue,
      },
      local: { schema: localStateSchema, initialValue: localStateInitialValue },
    },
    modules,
  } = document.state.global.specifications[0];
  const operations = modules.flatMap((module) => module.operations);
  const shouldSetInitialName = useRef(
    !modelName && !!documentNodeName && operations.length === 0,
  );

  useEffect(() => {
    if (!shouldSetInitialName.current || !documentNodeName) return;

    const initialSchemaDoc = initializeModelSchema(documentNodeName);
    const actions = [
      setModelName({ name: documentNodeName }),
      setStateSchema({ schema: initialSchemaDoc, scope: "global" }),
    ];
    dispatch(actions);
    shouldSetInitialName.current = false;
  }, [documentNodeName, dispatch]);

  const operationSchemasSdl = operations
    .flatMap((operation) => operation.schema ?? [])
    .join("\n");

  const handleSetModelId = (id: string) => {
    if (compareStringsWithoutWhitespace(id, documentType)) return;
    dispatch([setModelId({ id })]);
  };

  const handleSetModelDescription = (newDescription: string) => {
    if (compareStringsWithoutWhitespace(newDescription, description)) return;
    dispatch(setModelDescription({ description: newDescription }));
  };

  const handleSetModelExtension = (newExtension: string) => {
    if (compareStringsWithoutWhitespace(newExtension, extension)) return;
    dispatch(setModelExtension({ extension: newExtension }));
  };

  const handleSetModelName = (newName: string) => {
    if (compareStringsWithoutWhitespace(newName, modelName)) return;
    dispatch(setModelName({ name: newName }));
  };

  const handleSetAuthorName = (newAuthorName: string) => {
    if (compareStringsWithoutWhitespace(newAuthorName, authorName)) return;
    dispatch(setAuthorName({ authorName: newAuthorName }));
  };

  const handleSetAuthorWebsite = (newAuthorWebsite: string) => {
    if (compareStringsWithoutWhitespace(newAuthorWebsite, authorWebsite ?? ""))
      return;
    dispatch(setAuthorWebsite({ authorWebsite: newAuthorWebsite }));
  };

  const handleSetStateSchema = (newSchema: string, scope: Scope) => {
    const oldSchema = scope === "global" ? globalStateSchema : localStateSchema;
    if (compareStringsWithoutWhitespace(newSchema, oldSchema)) return;
    dispatch(setStateSchema({ schema: newSchema, scope }));
  };

  const handleSetInitialState = (newInitialValue: string, scope: Scope) => {
    const oldInitialValue =
      scope === "global" ? globalStateInitialValue : localStateInitialValue;
    if (compareStringsWithoutWhitespace(newInitialValue, oldInitialValue))
      return;
    dispatch(setInitialState({ initialValue: newInitialValue, scope }));
  };

  const handleAddModule = (name: string): Promise<string | undefined> => {
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
        const id = generateId();
        dispatch(addModule({ id, name }));
        resolve(id);
      } catch (error) {
        console.error("Failed to add module:", error);
        resolve(undefined);
      }
    });
  };

  const handleSetModuleName = (id: string, name: string) => {
    if (
      modules.some((module) =>
        compareStringsWithoutWhitespace(module.name, name),
      )
    )
      return;
    dispatch(setModuleName({ id, name }));
  };

  const handleDeleteModule = (id: string) => {
    dispatch(deleteModule({ id }));
  };

  const handleAddOperation = (
    moduleId: string,
    name: string,
  ): Promise<string | undefined> => {
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
        const id = generateId();
        dispatch(addOperation({ id, moduleId, name }));
        resolve(id);
      } catch (error) {
        console.error("Failed to add operation:", error);
        resolve(undefined);
      }
    });
  };

  const handleSetOperationName = (id: string, name: string) => {
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
  };

  const handleSetOperationSchema = (id: string, newSchema: string) => {
    const operation = operations.find((operation) => operation.id === id);
    if (
      operation?.schema &&
      compareStringsWithoutWhitespace(newSchema, operation.schema)
    )
      return;
    dispatch(setOperationSchema({ id, schema: newSchema }));
  };

  const handleSetOperationDescription = (
    id: string,
    newDescription: string,
  ) => {
    const operationDescription =
      operations.find((operation) => operation.id === id)?.description ?? "";
    if (compareStringsWithoutWhitespace(operationDescription, newDescription))
      return;
    dispatch(setOperationDescription({ id, description: newDescription }));
  };

  const handleDeleteOperation = (id: string) => {
    dispatch(deleteOperation({ id }));
  };

  const handleAddOperationError = (
    operationId: string,
    errorName: string,
  ): Promise<string | undefined> => {
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
        const id = generateId();
        const errorCode = pascalCase(errorName);
        dispatch(addOperationError({ id, operationId, errorName, errorCode }));
        resolve(id);
      } catch (error) {
        console.error("Failed to add operation error:", error);
        resolve(undefined);
      }
    });
  };

  const handleDeleteOperationError = (id: string) => {
    dispatch(deleteOperationError({ id }));
  };

  const handleSetOperationErrorName = (
    operationId: string,
    errorId: string,
    errorName: string,
  ) => {
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
  };

  const addOperationAndInitialSchema = async (
    moduleId: string,
    name: string,
  ): Promise<string | undefined> => {
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
  };

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
