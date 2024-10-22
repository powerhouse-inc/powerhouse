import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TDocumentModel } from "../schemas/document-model";
import { DocumentActionHandlers } from "../types/document";
import { DocumentModelEditorProps } from "../editor";
import { actions, DocumentModelAction } from "document-model/document-model";
import {
  BaseAction,
  ActionErrorCallback,
  OperationScope,
  utils,
} from "document-model/document";
import { Scope } from "../types/modules";
import { syncWithDocument } from "../store/documentModelStore";
import { syncModulesFromDocument } from "../store/moduleStore";

type TDocumentModelContext = {
  document: TDocumentModel | undefined;
  hasSetInitialMetadata: boolean;
  handlers: DocumentActionHandlers;
};

export const DocumentModelContext = createContext<TDocumentModelContext>({
  document: undefined,
  hasSetInitialMetadata: false,
  handlers: {} as DocumentActionHandlers,
});

export const useDocumentModel = () => useContext(DocumentModelContext);

export function DocumentModelProvider(
  props: DocumentModelEditorProps & {
    children: ReactNode;
    dispatch: (
      action: DocumentModelAction | BaseAction,
      onErrorCallback?: ActionErrorCallback,
    ) => void;
  },
) {
  const { document, dispatch, children } = props;
  const [hasSetInitialMetadata, setHasSetInitialMetadata] = useState(false);

  useEffect(() => {
    if (document.name) {
      setHasSetInitialMetadata(true);
    }
  }, [document.name]);

  useEffect(() => {
    syncWithDocument(document);
    syncModulesFromDocument(document);
  }, [document]);

  const setModelId = (id: string) => {
    dispatch(actions.setModelId({ id }));
  };

  const setModuleDescription = (description: string) => {
    dispatch(actions.setModelDescription({ description }));
  };

  const setModelExtension = (extension: string) => {
    dispatch(actions.setModelExtension({ extension }));
  };

  const setModelName = (name: string) => {
    dispatch(actions.setModelName({ name }));
    dispatch(actions.setName(name));
  };

  const setAuthorName = (authorName: string) => {
    dispatch(actions.setAuthorName({ authorName }));
  };

  const setAuthorWebsite = (authorWebsite: string) => {
    dispatch(actions.setAuthorWebsite({ authorWebsite }));
  };

  const setStateSchema = (schema: string, scope: Scope) => {
    dispatch(actions.setStateSchema({ schema, scope }));
  };

  const setInitialState = (initialValue: string, scope: Scope) => {
    dispatch(actions.setInitialState({ initialValue, scope }));
  };

  const addModule = (name: string) => {
    dispatch(actions.addModule({ id: utils.hashKey(), name }));
  };

  const updateModuleName = (id: string, name: string) => {
    dispatch(actions.setModuleName({ id, name }));
  };

  const updateModuleDescription = (id: string, description: string) => {
    dispatch(actions.setModuleDescription({ id, description }));
  };

  const deleteModule = (id: string) => {
    dispatch(actions.deleteModule({ id }));
  };

  const addOperation = (moduleId: string, name: string) => {
    dispatch(actions.addOperation({ id: utils.hashKey(), moduleId, name }));
  };

  const updateOperationName = (id: string, name: string) => {
    dispatch(actions.setOperationName({ id, name }));
  };

  const updateOperationSchema = (id: string, schema: string) => {
    dispatch(actions.setOperationSchema({ id, schema }));
  };

  const updateOperationScope = (id: string, scope: OperationScope) => {
    dispatch(actions.setOperationScope({ id, scope }));
  };

  const deleteOperation = (id: string) => {
    dispatch(actions.deleteOperation({ id }));
  };

  const handlers = {
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
  } as const;

  const value = useMemo(
    () => ({ document, hasSetInitialMetadata, handlers }),
    [document, hasSetInitialMetadata, handlers],
  );

  return (
    <DocumentModelContext.Provider value={value}>
      {children}
    </DocumentModelContext.Provider>
  );
}
