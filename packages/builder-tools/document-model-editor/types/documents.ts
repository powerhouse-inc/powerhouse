export type Scope = string;

export type DocumentActionHandlers = {
  // Creation handlers that return IDs
  addModule: (name: string) => Promise<string | undefined>;
  addOperation: (moduleId: string, name: string) => Promise<string | undefined>;
  addOperationAndInitialSchema: (
    moduleId: string,
    name: string,
  ) => Promise<string | undefined>;
  addOperationError: (
    operationId: string,
    errorName: string,
  ) => Promise<string | undefined>;

  // Regular handlers
  setModelId: (id: string) => void;
  setModelExtension: (extension: string) => void;
  setModelName: (name: string) => void;
  setAuthorName: (authorName: string) => void;
  setAuthorWebsite: (authorWebsite: string) => void;
  setStateSchema: (schema: string, scope: Scope) => void;
  setInitialState: (initialValue: string, scope: Scope) => void;
  setModelDescription: (description: string) => void;
  updateModuleName: (id: string, name: string) => void;
  updateModuleDescription: (id: string, description: string) => void;
  deleteModule: (id: string) => void;
  updateOperationName: (id: string, name: string) => void;
  updateOperationSchema: (id: string, schema: string) => void;
  updateOperationScope: (id: string, scope: Scope) => void;
  setOperationDescription: (id: string, description: string) => void;
  deleteOperation: (id: string) => void;
  deleteOperationError: (id: string) => void;
  setOperationErrorName: (
    operationId: string,
    errorId: string,
    errorName: string,
  ) => void;
};
