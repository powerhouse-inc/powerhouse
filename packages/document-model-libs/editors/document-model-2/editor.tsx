import { useMemo, useCallback, useState, useEffect } from "react";
import {
  getDocumentMetadata,
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
import {
  MetadataFormValues,
  ModelMetadata,
} from "./components/model-metadata-form";

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
    documentType,
    extension,
    description,
    author,
  } = useMemo(() => getDocumentMetadata(document), [document]);
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

  const addOperation = useCallback(
    (moduleId: string, name: string): Promise<string> => {
      return new Promise((resolve) => {
        const id = utils.hashKey();
        dispatch(actions.addOperation({ id, moduleId, name }));
        resolve(id);
      });
    },
    [],
  );

  const updateOperationName = useCallback((id: string, name: string) => {
    dispatch(actions.setOperationName({ id, name }));
  }, []);

  const updateOperationSchema = useCallback((id: string, schema: string) => {
    dispatch(actions.setOperationSchema({ id, schema }));
  }, []);

  const addOperationAndInitialSchema = useCallback(
    async (moduleId: string, name: string) => {
      const id = await addOperation(moduleId, name);
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
      addOperationAndInitialSchema,
      updateOperationName,
      updateOperationSchema,
      updateOperationScope,
      deleteOperation,
    }),
    [],
  );
  return (
    <main className="mx-auto min-h-dvh max-w-screen-lg px-4 pt-8">
      <ModelMetadata
        name={modelName}
        documentType={documentType}
        extension={extension}
        description={description}
        author={author as MetadataFormValues["author"]}
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