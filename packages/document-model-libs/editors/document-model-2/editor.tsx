import { useMemo } from "react";
import {
  compareStringsWithoutWhitespace,
  makeOperationInitialDoc,
  Scope,
} from ".";
import {
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState,
  actions,
} from "document-model/document-model";
import { EditorProps, OperationScope, utils } from "document-model/document";
import { DocumentModelEditor } from "./document-model-editor";
import { ModelMetadata } from "./components/model-metadata-form";
import { SchemaContextProvider } from "./context/schema-context";

export default function Editor(
  props: EditorProps<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
  >,
) {
  const { document, dispatch } = props;
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

  const handlers = useMemo(
    () => ({
      setModelId: (id: string) => {
        if (compareStringsWithoutWhitespace(id, documentType)) return;
        dispatch(actions.setModelId({ id }));
      },

      setModelDescription: (newDescription: string) => {
        if (compareStringsWithoutWhitespace(newDescription, description))
          return;
        dispatch(actions.setModelDescription({ description: newDescription }));
      },

      setModelExtension: (newExtension: string) => {
        if (compareStringsWithoutWhitespace(newExtension, extension)) return;
        dispatch(actions.setModelExtension({ extension: newExtension }));
      },

      setModelName: (newName: string) => {
        if (compareStringsWithoutWhitespace(newName, modelName)) return;
        dispatch(actions.setModelName({ name: newName }));
      },

      setAuthorName: (newAuthorName: string) => {
        if (compareStringsWithoutWhitespace(newAuthorName, authorName)) return;
        dispatch(actions.setAuthorName({ authorName: newAuthorName }));
      },

      setAuthorWebsite: (newAuthorWebsite: string) => {
        if (
          compareStringsWithoutWhitespace(newAuthorWebsite, authorWebsite ?? "")
        )
          return;
        dispatch(actions.setAuthorWebsite({ authorWebsite: newAuthorWebsite }));
      },

      setStateSchema: (newSchema: string, scope: Scope) => {
        const oldSchema =
          scope === "global" ? globalStateSchema : localStateSchema;
        if (compareStringsWithoutWhitespace(newSchema, oldSchema)) return;

        dispatch(actions.setStateSchema({ schema: newSchema, scope }));
      },

      setInitialState: (newInitialValue: string, scope: Scope) => {
        const oldInitialValue =
          scope === "global" ? globalStateInitialValue : localStateInitialValue;
        if (compareStringsWithoutWhitespace(newInitialValue, oldInitialValue))
          return;
        dispatch(
          actions.setInitialState({ initialValue: newInitialValue, scope }),
        );
      },

      addModule: (name: string): Promise<string | undefined> => {
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

      updateModuleName: (id: string, name: string) => {
        if (
          modules.some((module) =>
            compareStringsWithoutWhitespace(module.name, name),
          )
        )
          return;
        dispatch(actions.setModuleName({ id, name }));
      },

      updateModuleDescription: (id: string, description: string) => {
        const oldModuleDescription = modules.find(
          (module) => module.id === id,
        )?.description;
        if (
          oldModuleDescription &&
          compareStringsWithoutWhitespace(oldModuleDescription, description)
        )
          return;
        dispatch(actions.setModuleDescription({ id, description }));
      },

      deleteModule: (id: string) => dispatch(actions.deleteModule({ id })),

      addOperation: (
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

            const id = utils.hashKey();
            dispatch(actions.addOperation({ id, moduleId, name }));
            resolve(id);
          } catch (error) {
            console.error("Failed to add operation:", error);
            resolve(undefined);
          }
        });
      },

      updateOperationName: (id: string, name: string) => {
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

      updateOperationSchema: (id: string, newSchema: string) => {
        const operation = operations.find((operation) => operation.id === id);
        if (
          operation?.schema &&
          compareStringsWithoutWhitespace(newSchema, operation.schema)
        )
          return;
        dispatch(actions.setOperationSchema({ id, schema: newSchema }));
      },

      updateOperationScope: (id: string, scope: OperationScope) => {
        dispatch(actions.setOperationScope({ id, scope }));
      },

      setOperationDescription: (id: string, newDescription: string) => {
        const operationDescription =
          operations.find((operation) => operation.id === id)?.description ??
          "";
        if (
          compareStringsWithoutWhitespace(operationDescription, newDescription)
        )
          return;
        dispatch(
          actions.setOperationDescription({ id, description: newDescription }),
        );
      },

      deleteOperation: (id: string) =>
        dispatch(actions.deleteOperation({ id })),

      addOperationError: (
        operationId: string,
        errorName: string,
      ): Promise<string | undefined> => {
        return new Promise((resolve) => {
          try {
            const operation = operations.find(
              (operation) => operation.id === operationId,
            );
            const operationErrorNames =
              operation?.errors.map((error) => error.name).filter(Boolean) ??
              [];

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

      deleteOperationError: (id: string) =>
        dispatch(actions.deleteOperationError({ id })),

      setOperationErrorName: (
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
        dispatch(actions.setOperationErrorName({ id: errorId, errorName }));
      },

      addOperationAndInitialSchema: async (
        moduleId: string,
        name: string,
      ): Promise<string | undefined> => {
        try {
          const id = await handlers.addOperation(moduleId, name);
          if (!id) return undefined;

          try {
            handlers.updateOperationSchema(id, makeOperationInitialDoc(name));
            return id;
          } catch (error) {
            console.error("Failed to update operation schema:", error);
            // Consider if you want to delete the operation if schema update fails
            return undefined;
          }
        } catch (error) {
          console.error("Failed to add operation and schema:", error);
          return undefined;
        }
      },
    }),
    [
      documentType,
      description,
      extension,
      modelName,
      authorName,
      authorWebsite,
      globalStateSchema,
      localStateSchema,
      globalStateInitialValue,
      localStateInitialValue,
      modules,
      operations,
      dispatch,
    ],
  );

  return (
    <main className="mx-auto min-h-dvh max-w-6xl bg-gray-50 px-4 pt-8">
      <SchemaContextProvider
        globalStateSchema={globalStateSchema}
        localStateSchema={localStateSchema}
        operations={operations}
      >
        <ModelMetadata
          name={modelName}
          documentType={documentType}
          extension={extension}
          description={description}
          authorName={authorName}
          authorWebsite={authorWebsite ?? ""}
          handlers={handlers}
          globalStateSchema={globalStateSchema}
          localStateSchema={localStateSchema}
        />
        <DocumentModelEditor
          modelName={modelName}
          globalStateSchema={globalStateSchema}
          globalStateInitialValue={globalStateInitialValue}
          localStateSchema={localStateSchema}
          localStateInitialValue={localStateInitialValue}
          handlers={handlers}
          modules={modules}
          operations={operations}
        />
      </SchemaContextProvider>
    </main>
  );
}
