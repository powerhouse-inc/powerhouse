import { useMemo, useCallback, useState, useEffect } from "react";
import {
  compareStringsWithoutWhitespace,
  hiddenQueryTypeDefDoc,
  initialSchema,
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
import { buildSchema } from "graphql";
import { ModelMetadata } from "./components/model-metadata-form";

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
  } = useMemo(
    () => document.state.global,
    [
      document.state.global.name,
      document.state.global.id,
      document.state.global.extension,
      document.state.global.description,
      document.state.global.author.name,
      document.state.global.author.website,
    ],
  );
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
    [
      document.state.global.specifications[0].state.global,
      document.state.global.specifications[0].state.local,
      document.state.global.specifications[0].modules,
    ],
  );
  const operations = useMemo(
    () => modules.flatMap((module) => module.operations),
    [modules],
  );
  const [schema, setSchema] = useState(initialSchema);
  const [errors, setErrors] = useState("");

  useEffect(() => {
    try {
      const newSchema = buildSchema(`
              ${hiddenQueryTypeDefDoc}
              ${globalStateSchema}
              ${localStateSchema}
              ${modules
                .flatMap((module) =>
                  module.operations.map((operation) => operation.schema),
                )
                .filter(Boolean)
                .join("\n")}
            `);
      setSchema(newSchema);
      setErrors("");
    } catch (e) {
      if (e instanceof Error) {
        setErrors(e.message);
      }
    }
  }, [hiddenQueryTypeDefDoc, globalStateSchema, localStateSchema, modules]);

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
    (name: string) => {
      if (
        modules.some((module) =>
          compareStringsWithoutWhitespace(module.name, name),
        )
      )
        return;
      dispatch(actions.addModule({ id: utils.hashKey(), name }));
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

  const updateModuleDescription = useCallback(
    (id: string, description: string) => {
      const oldModuleDescription = modules.find(
        (module) => module.id === id,
      )?.description;
      if (
        !!oldModuleDescription &&
        compareStringsWithoutWhitespace(oldModuleDescription, description)
      )
        return;
      dispatch(actions.setModuleDescription({ id, description }));
    },
    [modules],
  );

  const deleteModule = useCallback((id: string) => {
    dispatch(actions.deleteModule({ id }));
  }, []);

  const addOperation = useCallback(
    (moduleId: string, name: string): Promise<string | undefined> => {
      return new Promise((resolve) => {
        const moduleOperationNames = (
          modules.find((module) => module.id === moduleId)?.operations || []
        )
          .map((operation) => operation.name)
          .filter(Boolean);
        if (
          moduleOperationNames.some((operationName) =>
            compareStringsWithoutWhitespace(operationName, name),
          )
        )
          return;
        const id = utils.hashKey();
        dispatch(actions.addOperation({ id, moduleId, name }));
        resolve(id);
      });
    },
    [modules],
  );

  const updateOperationName = useCallback(
    (id: string, name: string) => {
      const operationModule = modules.find((module) =>
        module.operations.some((operation) => operation.id === id),
      );
      const operationNames = (
        operationModule?.operations.map((operation) => operation.name) ?? []
      ).filter(Boolean);
      if (
        operationNames.some((operationName) =>
          compareStringsWithoutWhitespace(operationName, name),
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
        !!operation?.schema &&
        compareStringsWithoutWhitespace(newSchema, operation.schema)
      )
        return;
      dispatch(actions.setOperationSchema({ id, schema: newSchema }));
    },
    [operations],
  );

  const addOperationAndInitialSchema = useCallback(
    async (moduleId: string, name: string) => {
      const id = await addOperation(moduleId, name);
      if (!id) return;
      updateOperationSchema(id, makeOperationInitialDoc(name));
    },
    [],
  );

  const updateOperationScope = useCallback(
    (id: string, scope: OperationScope) => {
      dispatch(actions.setOperationScope({ id, scope }));
    },
    [],
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

  const deleteOperation = useCallback((id: string) => {
    dispatch(actions.deleteOperation({ id }));
  }, []);

  const addOperationError = useCallback(
    (operationId: string, errorName: string) => {
      const operation = operations.find(
        (operation) => operation.id === operationId,
      );
      const operationErrorNames =
        operation?.errors.map((error) => error.name).filter(Boolean) ?? [];

      if (
        operationErrorNames.some((errorName) =>
          compareStringsWithoutWhitespace(errorName, errorName),
        )
      )
        return;

      const id = utils.hashKey();
      dispatch(actions.addOperationError({ id, operationId, errorName }));
    },
    [operations],
  );

  const deleteOperationError = useCallback((id: string) => {
    dispatch(actions.deleteOperationError({ id }));
  }, []);

  const setOperationErrorName = useCallback(
    (operationId: string, errorId: string, errorName: string) => {
      const operation = operations.find(
        (operation) => operation.id === operationId,
      );
      const operationErrorNames =
        operation?.errors.map((error) => error.name).filter(Boolean) ?? [];

      if (
        operationErrorNames.some((errorName) =>
          compareStringsWithoutWhitespace(errorName, errorName),
        )
      )
        return;
      dispatch(actions.setOperationErrorName({ id: errorId, errorName }));
    },
    [operations],
  );

  const handlers = {
    setModelId,
    setModelExtension,
    setModelName,
    setAuthorName,
    setAuthorWebsite,
    setStateSchema,
    setInitialState,
    addModule,
    setModelDescription,
    updateModuleName,
    updateModuleDescription,
    deleteModule,
    addOperation,
    addOperationAndInitialSchema,
    updateOperationName,
    updateOperationSchema,
    updateOperationScope,
    setOperationDescription,
    deleteOperation,
    addOperationError,
    deleteOperationError,
    setOperationErrorName,
  };

  return (
    <main className="mx-auto min-h-dvh max-w-screen-lg px-4 pt-8">
      <ModelMetadata
        name={modelName}
        documentType={documentType}
        extension={extension}
        description={description}
        authorName={authorName}
        authorWebsite={authorWebsite ?? ""}
        handlers={handlers}
        globalStateSchema={globalStateSchema}
        globalStateInitialValue={globalStateInitialValue}
        schema={schema}
      />
      <DocumentModelEditor
        errors={errors}
        schema={schema}
        modelName={modelName}
        globalStateSchema={globalStateSchema}
        globalStateInitialValue={globalStateInitialValue}
        localStateSchema={localStateSchema}
        localStateInitialValue={localStateInitialValue}
        handlers={handlers}
        modules={modules}
      />
    </main>
  );
}
