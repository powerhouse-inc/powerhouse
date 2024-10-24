import { Scope } from "./modules";

export type DocumentActionHandlers = {
  setModelId: (id: string) => void;
  setModelExtension: (extension: string) => void;
  setModelName: (name: string) => void;
  setAuthorName: (authorName: string) => void;
  setAuthorWebsite: (authorWebsite: string) => void;
  setStateSchema: (schema: string, scope: Scope) => void;
  setInitialState: (initialValue: string, scope: Scope) => void;
  addModule: (name: string) => void;
  setModuleDescription: (description: string) => void;
  updateModuleName: (id: string, name: string) => void;
  updateModuleDescription: (id: string, description: string) => void;
  deleteModule: (id: string) => void;
  addOperation: (moduleId: string, name: string) => void;
  updateOperationName: (id: string, name: string) => void;
  updateOperationSchema: (id: string, schema: string) => void;
  updateOperationScope: (id: string, scope: Scope) => void;
  deleteOperation: (id: string) => void;
};
