import type {
  Action,
  CreateDocument,
  CreateState,
  EditorModule,
  ImportScriptModule,
  InputMaybe,
  LoadFromInput,
  LoadStateAction,
  Manifest,
  Maybe,
  NOOPAction,
  PHBaseState,
  PHDocument,
  PruneAction,
  RedoAction,
  Reducer,
  SaveToFileHandle,
  Scalars,
  SetNameAction,
  SubgraphModule,
  UndoAction,
} from "document-model";

export type BaseAction =
  | SetNameAction
  | UndoAction
  | RedoAction
  | PruneAction
  | LoadStateAction
  | NOOPAction;

export type DocumentModelModule<TState extends PHBaseState = PHBaseState> = {
  reducer: Reducer<TState>;
  actions: Record<string, (...args: any[]) => Action>;
  utils: DocumentModelUtils<TState>;
  documentModel: DocumentModelPHState;
};
export type DocumentModelUtils<TState extends PHBaseState = PHBaseState> = {
  fileExtension: string;
  createState: CreateState<TState>;
  createDocument: CreateDocument<TState>;
  loadFromInput: LoadFromInput<TState>;
  saveToFileHandle: SaveToFileHandle;
};
export type DocumentModelLib<TState extends PHBaseState = PHBaseState> = {
  manifest: Manifest;
  documentModels: DocumentModelModule<TState>[];
  editors: EditorModule[];
  subgraphs: SubgraphModule[];
  importScripts: ImportScriptModule[];
};
export type DocumentModelDocument = PHDocument<DocumentModelPHState>;
export type DocumentModelDocumentModelModule =
  DocumentModelModule<DocumentModelPHState>;

export type DocumentModelAction =
  | DocumentModelHeaderAction
  | DocumentModelVersioningAction
  | DocumentModelModuleAction
  | DocumentModelOperationErrorAction
  | DocumentModelOperationExampleAction
  | DocumentModelOperationAction
  | DocumentModelStateAction;

export type AddChangeLogItemInput = {
  __typename?: "AddChangeLogItemInput";
  content: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  insertBefore: Maybe<Scalars["ID"]["output"]>;
};

export type AddModuleInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
};

export type AddOperationErrorInput = {
  errorCode?: InputMaybe<Scalars["String"]["input"]>;
  errorDescription?: InputMaybe<Scalars["String"]["input"]>;
  errorName?: InputMaybe<Scalars["String"]["input"]>;
  errorTemplate?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
  operationId: Scalars["ID"]["input"];
};

export type AddOperationExampleInput = {
  example: Scalars["String"]["input"];
  id: Scalars["ID"]["input"];
  operationId: Scalars["ID"]["input"];
};

export type AddOperationInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
  moduleId: Scalars["ID"]["input"];
  name: Scalars["String"]["input"];
  reducer?: InputMaybe<Scalars["String"]["input"]>;
  schema?: InputMaybe<Scalars["String"]["input"]>;
  template?: InputMaybe<Scalars["String"]["input"]>;
  scope?: InputMaybe<string>;
};

export type AddStateExampleInput = {
  scope: Scalars["String"]["input"];
  example: Scalars["String"]["input"];
  id: Scalars["ID"]["input"];
  insertBefore?: InputMaybe<Scalars["ID"]["input"]>;
};

export type Author = {
  __typename?: "Author";
  name: Scalars["String"]["output"];
  website: Maybe<Scalars["String"]["output"]>;
};

export type CodeExample = {
  __typename?: "CodeExample";
  id: Scalars["ID"]["output"];
  value: Scalars["String"]["output"];
};

export type DeleteChangeLogItemInput = {
  __typename?: "DeleteChangeLogItemInput";
  id: Scalars["ID"]["output"];
};

export type DeleteModuleInput = {
  id: Scalars["ID"]["input"];
};

export type DeleteOperationErrorInput = {
  id: Scalars["ID"]["input"];
};

export type DeleteOperationExampleInput = {
  id: Scalars["ID"]["input"];
};

export type DeleteOperationInput = {
  id: Scalars["ID"]["input"];
};

export type DeleteStateExampleInput = {
  scope: Scalars["String"]["input"];
  id: Scalars["ID"]["input"];
};

export type DocumentModelInput =
  | AddChangeLogItemInput
  | AddModuleInput
  | AddOperationErrorInput
  | AddOperationExampleInput
  | AddOperationInput
  | AddStateExampleInput
  | DeleteChangeLogItemInput
  | DeleteModuleInput
  | DeleteOperationErrorInput
  | DeleteOperationExampleInput
  | DeleteOperationInput
  | DeleteStateExampleInput
  | MoveOperationInput
  | ReorderChangeLogItemsInput
  | ReorderModuleOperationsInput
  | ReorderModulesInput
  | ReorderOperationErrorsInput
  | ReorderOperationExamplesInput
  | ReorderStateExamplesInput
  | SetAuthorNameInput
  | SetAuthorWebsiteInput
  | SetInitialStateInput
  | SetModelDescriptionInput
  | SetModelExtensionInput
  | SetModelIdInput
  | SetModelNameInput
  | SetModuleDescriptionInput
  | SetModuleNameInput
  | SetOperationDescriptionInput
  | SetOperationErrorCodeInput
  | SetOperationErrorDescriptionInput
  | SetOperationErrorNameInput
  | SetOperationErrorTemplateInput
  | SetOperationNameInput
  | SetOperationReducerInput
  | SetOperationSchemaInput
  | SetOperationTemplateInput
  | SetStateSchemaInput
  | UpdateChangeLogItemInput
  | UpdateOperationExampleInput
  | UpdateStateExampleInput;

export type DocumentModelGlobalState = {
  author: Author;
  description: Scalars["String"]["output"];
  extension: Scalars["String"]["output"];
  id: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  specifications: Array<DocumentSpecification>;
};

export type DocumentModelLocalState = {};
export type DocumentModelPHState = PHBaseState & {
  global: DocumentModelGlobalState;
  local: DocumentModelLocalState;
};

export type ScopeState = {
  global: State;
  local: State;
};

export type DocumentSpecification = {
  __typename?: "DocumentSpecification";
  changeLog: Array<Scalars["String"]["output"]>;
  modules: Array<ModuleSpecification>;
  state: ScopeState;
  version: Scalars["Int"]["output"];
};

export type ModuleSpecification = {
  __typename?: "ModuleSpecification";
  description: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  operations: Array<OperationSpecification>;
};

export type MoveOperationInput = {
  newModuleId: Scalars["ID"]["input"];
  operationId: Scalars["ID"]["input"];
};

export type Mutation = {
  __typename?: "Mutation";
  addChangeLogItemInput: DocumentModelGlobalState;
  addModule: DocumentModelGlobalState;
  addOperation: DocumentModelGlobalState;
  addOperationError: DocumentModelGlobalState;
  addOperationExample: DocumentModelGlobalState;
  addStateExample: DocumentModelGlobalState;
  deleteChangeLogItemInput: DocumentModelGlobalState;
  deleteModule: DocumentModelGlobalState;
  deleteOperation: DocumentModelGlobalState;
  deleteOperationError: DocumentModelGlobalState;
  deleteOperationExample: DocumentModelGlobalState;
  deleteStateExample: DocumentModelGlobalState;
  moveOperation: DocumentModelGlobalState;
  releaseNewVersion: DocumentModelGlobalState;
  reorderChangeLogItemsInput: DocumentModelGlobalState;
  reorderModuleOperations: DocumentModelGlobalState;
  reorderModules: DocumentModelGlobalState;
  reorderOperationErrors: DocumentModelGlobalState;
  reorderOperationExamples: DocumentModelGlobalState;
  reorderStateExamples: DocumentModelGlobalState;
  setAuthorName: DocumentModelGlobalState;
  setAuthorWebsite: DocumentModelGlobalState;
  setInitialState: DocumentModelGlobalState;
  setModelDescription: DocumentModelGlobalState;
  setModelExtension: DocumentModelGlobalState;
  setModelId: DocumentModelGlobalState;
  setModelName: DocumentModelGlobalState;
  setModuleDescription: DocumentModelGlobalState;
  setModuleName: DocumentModelGlobalState;
  setOperationDescription: DocumentModelGlobalState;
  setOperationErrorCode: DocumentModelGlobalState;
  setOperationErrorDescription: DocumentModelGlobalState;
  setOperationErrorName: DocumentModelGlobalState;
  setOperationErrorTemplate: DocumentModelGlobalState;
  setOperationName: DocumentModelGlobalState;
  setOperationReducer: DocumentModelGlobalState;
  setOperationSchema: DocumentModelGlobalState;
  setOperationTemplate: DocumentModelGlobalState;
  setStateSchema: DocumentModelGlobalState;
  updateChangeLogItemInput: DocumentModelGlobalState;
  updateOperationExample: DocumentModelGlobalState;
  updateStateExample: DocumentModelGlobalState;
};

export type MutationAddChangeLogItemInputArgs = {
  input?: InputMaybe<AddChangeLogItemInput>;
};

export type MutationAddModuleArgs = {
  input: AddModuleInput;
};

export type MutationAddOperationArgs = {
  input: AddOperationInput;
};

export type MutationAddOperationErrorArgs = {
  input: AddOperationErrorInput;
};

export type MutationAddOperationExampleArgs = {
  input: AddOperationExampleInput;
};

export type MutationAddStateExampleArgs = {
  input: AddStateExampleInput;
};

export type MutationDeleteChangeLogItemInputArgs = {
  input?: InputMaybe<DeleteChangeLogItemInput>;
};

export type MutationDeleteModuleArgs = {
  input: DeleteModuleInput;
};

export type MutationDeleteOperationArgs = {
  input: DeleteOperationInput;
};

export type MutationDeleteOperationErrorArgs = {
  input: DeleteOperationErrorInput;
};

export type MutationDeleteOperationExampleArgs = {
  input: DeleteOperationExampleInput;
};

export type MutationDeleteStateExampleArgs = {
  input: DeleteStateExampleInput;
};

export type MutationMoveOperationArgs = {
  input: MoveOperationInput;
};

export type MutationReorderChangeLogItemsInputArgs = {
  input?: InputMaybe<ReorderChangeLogItemsInput>;
};

export type MutationReorderModuleOperationsArgs = {
  input: ReorderModuleOperationsInput;
};

export type MutationReorderModulesArgs = {
  input: ReorderModulesInput;
};

export type MutationReorderOperationErrorsArgs = {
  input: ReorderOperationErrorsInput;
};

export type MutationReorderOperationExamplesArgs = {
  input: ReorderOperationExamplesInput;
};

export type MutationReorderStateExamplesArgs = {
  input: ReorderStateExamplesInput;
};

export type MutationSetAuthorNameArgs = {
  input: SetAuthorNameInput;
};

export type MutationSetAuthorWebsiteArgs = {
  input: SetAuthorWebsiteInput;
};

export type MutationSetInitialStateArgs = {
  input: SetInitialStateInput;
};

export type MutationSetModelDescriptionArgs = {
  input: SetModelDescriptionInput;
};

export type MutationSetModelExtensionArgs = {
  input: SetModelExtensionInput;
};

export type MutationSetModelIdArgs = {
  input: SetModelIdInput;
};

export type MutationSetModelNameArgs = {
  input: SetModelNameInput;
};

export type MutationSetModuleDescriptionArgs = {
  input: SetModuleDescriptionInput;
};

export type MutationSetModuleNameArgs = {
  input: SetModuleNameInput;
};

export type MutationSetOperationDescriptionArgs = {
  input: SetOperationDescriptionInput;
};

export type MutationSetOperationErrorCodeArgs = {
  input: SetOperationErrorCodeInput;
};

export type MutationSetOperationErrorDescriptionArgs = {
  input: SetOperationErrorDescriptionInput;
};

export type MutationSetOperationErrorNameArgs = {
  input: SetOperationErrorNameInput;
};

export type MutationSetOperationErrorTemplateArgs = {
  input: SetOperationErrorTemplateInput;
};

export type MutationSetOperationNameArgs = {
  input: SetOperationNameInput;
};

export type MutationSetOperationReducerArgs = {
  input: SetOperationReducerInput;
};

export type MutationSetOperationSchemaArgs = {
  input: SetOperationSchemaInput;
};

export type MutationSetOperationTemplateArgs = {
  input: SetOperationTemplateInput;
};

export type MutationSetStateSchemaArgs = {
  input: SetStateSchemaInput;
};

export type MutationUpdateChangeLogItemInputArgs = {
  input?: InputMaybe<UpdateChangeLogItemInput>;
};

export type MutationUpdateOperationExampleArgs = {
  input: UpdateOperationExampleInput;
};

export type MutationUpdateStateExampleArgs = {
  input: UpdateStateExampleInput;
};

export type OperationSpecification = {
  __typename?: "OperationSpecification";
  description: Maybe<Scalars["String"]["output"]>;
  errors: Array<OperationErrorSpecification>;
  examples: Array<CodeExample>;
  id: Scalars["ID"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
  reducer: Maybe<Scalars["String"]["output"]>;
  schema: Maybe<Scalars["String"]["output"]>;
  template: Maybe<Scalars["String"]["output"]>;
  scope: string;
};

export type OperationErrorSpecification = {
  __typename?: "OperationErrorSpecification";
  code: Maybe<Scalars["String"]["output"]>;
  description: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
  template: Maybe<Scalars["String"]["output"]>;
};

export type ReorderChangeLogItemsInput = {
  __typename?: "ReorderChangeLogItemsInput";
  order: Array<Scalars["ID"]["output"]>;
};

export type ReorderModuleOperationsInput = {
  moduleId: Scalars["ID"]["input"];
  order: Array<Scalars["ID"]["input"]>;
};

export type ReorderModulesInput = {
  order: Array<Scalars["ID"]["input"]>;
};

export type ReorderOperationErrorsInput = {
  operationId: Scalars["ID"]["input"];
  order: Array<Scalars["ID"]["input"]>;
};

export type ReorderOperationExamplesInput = {
  operationId: Scalars["ID"]["input"];
  order: Array<Scalars["ID"]["input"]>;
};

export type ReorderStateExamplesInput = {
  scope: Scalars["String"]["input"];
  order: Array<Scalars["ID"]["input"]>;
};

export type SetAuthorNameInput = {
  authorName: Scalars["String"]["input"];
};

export type SetAuthorWebsiteInput = {
  authorWebsite: Scalars["String"]["input"];
};

export type SetInitialStateInput = {
  scope: Scalars["String"]["input"];
  initialValue: Scalars["String"]["input"];
};

export type SetModelDescriptionInput = {
  description: Scalars["String"]["input"];
};

export type SetModelExtensionInput = {
  extension: Scalars["String"]["input"];
};

export type SetModelIdInput = {
  id: Scalars["String"]["input"];
};

export type SetModelNameInput = {
  name: Scalars["String"]["input"];
};

export type SetModuleDescriptionInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
};

export type SetModuleNameInput = {
  id: Scalars["ID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetOperationDescriptionInput = {
  description?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
};

export type SetOperationErrorCodeInput = {
  errorCode?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
};

export type SetOperationErrorDescriptionInput = {
  errorDescription?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
};

export type SetOperationErrorNameInput = {
  errorName?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
};

export type SetOperationErrorTemplateInput = {
  errorTemplate?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["ID"]["input"];
};

export type SetOperationNameInput = {
  id: Scalars["ID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetOperationScopeInput = {
  id: Scalars["ID"]["input"];
  scope?: InputMaybe<string>;
};

export type SetOperationReducerInput = {
  id: Scalars["ID"]["input"];
  reducer?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetOperationSchemaInput = {
  id: Scalars["ID"]["input"];
  schema?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetOperationTemplateInput = {
  id: Scalars["ID"]["input"];
  template?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetStateSchemaInput = {
  scope: Scalars["String"]["input"];
  schema: Scalars["String"]["input"];
};

export type State = {
  __typename?: "State";
  examples: Array<CodeExample>;
  initialValue: Scalars["String"]["output"];
  schema: Scalars["String"]["output"];
};

export type UpdateChangeLogItemInput = {
  __typename?: "UpdateChangeLogItemInput";
  id: Scalars["ID"]["output"];
  newContent: Scalars["String"]["output"];
};

export type UpdateOperationExampleInput = {
  example: Scalars["String"]["input"];
  id: Scalars["ID"]["input"];
};

export type UpdateStateExampleInput = {
  scope: Scalars["String"]["input"];
  id: Scalars["ID"]["input"];
  newExample: Scalars["String"]["input"];
};

export type SetModelNameAction = Action & {
  type: "SET_MODEL_NAME";
  input: SetModelNameInput;
};
export type SetModelIdAction = Action & {
  type: "SET_MODEL_ID";
  input: SetModelIdInput;
};
export type SetModelExtensionAction = Action & {
  type: "SET_MODEL_EXTENSION";
  input: SetModelExtensionInput;
};
export type SetModelDescriptionAction = Action & {
  type: "SET_MODEL_DESCRIPTION";
  input: SetModelDescriptionInput;
};
export type SetAuthorNameAction = Action & {
  type: "SET_AUTHOR_NAME";
  input: SetAuthorNameInput;
};
export type SetAuthorWebsiteAction = Action & {
  type: "SET_AUTHOR_WEBSITE";
  input: SetAuthorWebsiteInput;
};

export type DocumentModelHeaderAction =
  | SetModelNameAction
  | SetModelIdAction
  | SetModelExtensionAction
  | SetModelDescriptionAction
  | SetAuthorNameAction
  | SetAuthorWebsiteAction;

export type AddModuleAction = Action & {
  type: "ADD_MODULE";
  input: AddModuleInput;
};
export type SetModuleNameAction = Action & {
  type: "SET_MODULE_NAME";
  input: SetModuleNameInput;
};
export type SetModuleDescriptionAction = Action & {
  type: "SET_MODULE_DESCRIPTION";
  input: SetModuleDescriptionInput;
};
export type DeleteModuleAction = Action & {
  type: "DELETE_MODULE";
  input: DeleteModuleInput;
};
export type ReorderModulesAction = Action & {
  type: "REORDER_MODULES";
  input: ReorderModulesInput;
};

export type DocumentModelModuleAction =
  | AddModuleAction
  | SetModuleNameAction
  | SetModuleDescriptionAction
  | DeleteModuleAction
  | ReorderModulesAction;

export type AddOperationAction = Action & {
  type: "ADD_OPERATION";
  input: AddOperationInput;
};
export type SetOperationNameAction = Action & {
  type: "SET_OPERATION_NAME";
  input: SetOperationNameInput;
};
export type SetOperationScopeAction = Action & {
  type: "SET_OPERATION_SCOPE";
  input: SetOperationScopeInput;
};
export type SetOperationSchemaAction = Action & {
  type: "SET_OPERATION_SCHEMA";
  input: SetOperationSchemaInput;
};
export type SetOperationDescriptionAction = Action & {
  type: "SET_OPERATION_DESCRIPTION";
  input: SetOperationDescriptionInput;
};
export type SetOperationTemplateAction = Action & {
  type: "SET_OPERATION_TEMPLATE";
  input: SetOperationTemplateInput;
};
export type SetOperationReducerAction = Action & {
  type: "SET_OPERATION_REDUCER";
  input: SetOperationReducerInput;
};
export type MoveOperationAction = Action & {
  type: "MOVE_OPERATION";
  input: MoveOperationInput;
};
export type DeleteOperationAction = Action & {
  type: "DELETE_OPERATION";
  input: DeleteOperationInput;
};
export type ReorderModuleOperationsAction = Action & {
  type: "REORDER_MODULE_OPERATIONS";
  input: ReorderModuleOperationsInput;
};

export type DocumentModelOperationAction =
  | AddOperationAction
  | SetOperationNameAction
  | SetOperationScopeAction
  | SetOperationSchemaAction
  | SetOperationDescriptionAction
  | SetOperationTemplateAction
  | SetOperationReducerAction
  | MoveOperationAction
  | DeleteOperationAction
  | ReorderModuleOperationsAction;

export type AddOperationErrorAction = Action & {
  type: "ADD_OPERATION_ERROR";
  input: AddOperationErrorInput;
};
export type SetOperationErrorCodeAction = Action & {
  type: "SET_OPERATION_ERROR_CODE";
  input: SetOperationErrorCodeInput;
};
export type SetOperationErrorNameAction = Action & {
  type: "SET_OPERATION_ERROR_NAME";
  input: SetOperationErrorNameInput;
};
export type SetOperationErrorDescriptionAction = Action & {
  type: "SET_OPERATION_ERROR_DESCRIPTION";
  input: SetOperationErrorDescriptionInput;
};
export type SetOperationErrorTemplateAction = Action & {
  type: "SET_OPERATION_ERROR_TEMPLATE";
  input: SetOperationErrorTemplateInput;
};
export type DeleteOperationErrorAction = Action & {
  type: "DELETE_OPERATION_ERROR";
  input: DeleteOperationErrorInput;
};
export type ReorderOperationErrorsAction = Action & {
  type: "REORDER_OPERATION_ERRORS";
  input: ReorderOperationErrorsInput;
};

export type DocumentModelOperationErrorAction =
  | AddOperationErrorAction
  | SetOperationErrorCodeAction
  | SetOperationErrorNameAction
  | SetOperationErrorDescriptionAction
  | SetOperationErrorTemplateAction
  | DeleteOperationErrorAction
  | ReorderOperationErrorsAction;

export type AddOperationExampleAction = Action & {
  type: "ADD_OPERATION_EXAMPLE";
  input: AddOperationExampleInput;
};
export type UpdateOperationExampleAction = Action & {
  type: "UPDATE_OPERATION_EXAMPLE";
  input: UpdateOperationExampleInput;
};
export type DeleteOperationExampleAction = Action & {
  type: "DELETE_OPERATION_EXAMPLE";
  input: DeleteOperationExampleInput;
};
export type ReorderOperationExamplesAction = Action & {
  type: "REORDER_OPERATION_EXAMPLES";
  input: ReorderOperationExamplesInput;
};

export type DocumentModelOperationExampleAction =
  | AddOperationExampleAction
  | UpdateOperationExampleAction
  | DeleteOperationExampleAction
  | ReorderOperationExamplesAction;

export type SetStateSchemaAction = Action & {
  type: "SET_STATE_SCHEMA";
  input: SetStateSchemaInput;
};
export type SetInitialStateAction = Action & {
  type: "SET_INITIAL_STATE";
  input: SetInitialStateInput;
};
export type AddStateExampleAction = Action & {
  type: "ADD_STATE_EXAMPLE";
  input: AddStateExampleInput;
};
export type UpdateStateExampleAction = Action & {
  type: "UPDATE_STATE_EXAMPLE";
  input: UpdateStateExampleInput;
};
export type DeleteStateExampleAction = Action & {
  type: "DELETE_STATE_EXAMPLE";
  input: DeleteStateExampleInput;
};
export type ReorderStateExamplesAction = Action & {
  type: "REORDER_STATE_EXAMPLES";
  input: ReorderStateExamplesInput;
};

export type DocumentModelStateAction =
  | SetStateSchemaAction
  | SetInitialStateAction
  | AddStateExampleAction
  | UpdateStateExampleAction
  | DeleteStateExampleAction
  | ReorderStateExamplesAction;

export type AddChangeLogItemAction = Action & {
  type: "ADD_CHANGE_LOG_ITEM";
  input: AddChangeLogItemInput;
};
export type UpdateChangeLogItemAction = Action & {
  type: "UPDATE_CHANGE_LOG_ITEM";
  input: UpdateChangeLogItemInput;
};
export type DeleteChangeLogItemAction = Action & {
  type: "DELETE_CHANGE_LOG_ITEM";
  input: DeleteChangeLogItemInput;
};
export type ReorderChangeLogItemsAction = Action & {
  type: "REORDER_CHANGE_LOG_ITEMS";
  input: ReorderChangeLogItemsInput;
};
export type ReleaseNewVersionAction = Action & {
  type: "RELEASE_NEW_VERSION";
  input: {};
};

export type DocumentModelVersioningAction =
  | AddChangeLogItemAction
  | UpdateChangeLogItemAction
  | DeleteChangeLogItemAction
  | ReorderChangeLogItemsAction
  | ReleaseNewVersionAction;

export interface DocumentModelHeaderOperations {
  setModelNameOperation: (
    state: DocumentModelGlobalState,
    action: SetModelNameAction,
  ) => void;
  setModelIdOperation: (
    state: DocumentModelGlobalState,
    action: SetModelIdAction,
  ) => void;
  setModelExtensionOperation: (
    state: DocumentModelGlobalState,
    action: SetModelExtensionAction,
  ) => void;
  setModelDescriptionOperation: (
    state: DocumentModelGlobalState,
    action: SetModelDescriptionAction,
  ) => void;
  setAuthorNameOperation: (
    state: DocumentModelGlobalState,
    action: SetAuthorNameAction,
  ) => void;
  setAuthorWebsiteOperation: (
    state: DocumentModelGlobalState,
    action: SetAuthorWebsiteAction,
  ) => void;
}

export interface DocumentModelModuleOperations {
  addModuleOperation: (
    state: DocumentModelGlobalState,
    action: AddModuleAction,
  ) => void;
  setModuleNameOperation: (
    state: DocumentModelGlobalState,
    action: SetModuleNameAction,
  ) => void;
  setModuleDescriptionOperation: (
    state: DocumentModelGlobalState,
    action: SetModuleDescriptionAction,
  ) => void;
  deleteModuleOperation: (
    state: DocumentModelGlobalState,
    action: DeleteModuleAction,
  ) => void;
  reorderModulesOperation: (
    state: DocumentModelGlobalState,
    action: ReorderModulesAction,
  ) => void;
}

export type DocumentModelOperationOperations = {
  addOperationOperation: (
    state: DocumentModelGlobalState,
    action: AddOperationAction,
  ) => void;
  setOperationNameOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationNameAction,
  ) => void;
  setOperationScopeOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationScopeAction,
  ) => void;
  setOperationSchemaOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationSchemaAction,
  ) => void;
  setOperationDescriptionOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationDescriptionAction,
  ) => void;
  setOperationTemplateOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationTemplateAction,
  ) => void;
  setOperationReducerOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationReducerAction,
  ) => void;
  moveOperationOperation: (
    state: DocumentModelGlobalState,
    action: MoveOperationAction,
  ) => void;
  deleteOperationOperation: (
    state: DocumentModelGlobalState,
    action: DeleteOperationAction,
  ) => void;
  reorderModuleOperationsOperation: (
    state: DocumentModelGlobalState,
    action: ReorderModuleOperationsAction,
  ) => void;
};

export interface DocumentModelOperationErrorOperations {
  addOperationErrorOperation: (
    state: DocumentModelGlobalState,
    action: AddOperationErrorAction,
  ) => void;
  setOperationErrorCodeOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationErrorCodeAction,
  ) => void;
  setOperationErrorNameOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationErrorNameAction,
  ) => void;
  setOperationErrorDescriptionOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationErrorDescriptionAction,
  ) => void;
  setOperationErrorTemplateOperation: (
    state: DocumentModelGlobalState,
    action: SetOperationErrorTemplateAction,
  ) => void;
  deleteOperationErrorOperation: (
    state: DocumentModelGlobalState,
    action: DeleteOperationErrorAction,
  ) => void;
  reorderOperationErrorsOperation: (
    state: DocumentModelGlobalState,
    action: ReorderOperationErrorsAction,
  ) => void;
}

export interface DocumentModelOperationExampleOperations {
  addOperationExampleOperation: (
    state: DocumentModelGlobalState,
    action: AddOperationExampleAction,
  ) => void;
  updateOperationExampleOperation: (
    state: DocumentModelGlobalState,
    action: UpdateOperationExampleAction,
  ) => void;
  deleteOperationExampleOperation: (
    state: DocumentModelGlobalState,
    action: DeleteOperationExampleAction,
  ) => void;
  reorderOperationExamplesOperation: (
    state: DocumentModelGlobalState,
    action: ReorderOperationExamplesAction,
  ) => void;
}

export interface DocumentModelStateOperations {
  setStateSchemaOperation: (
    state: DocumentModelGlobalState,
    action: SetStateSchemaAction,
  ) => void;
  setInitialStateOperation: (
    state: DocumentModelGlobalState,
    action: SetInitialStateAction,
  ) => void;
  addStateExampleOperation: (
    state: DocumentModelGlobalState,
    action: AddStateExampleAction,
  ) => void;
  updateStateExampleOperation: (
    state: DocumentModelGlobalState,
    action: UpdateStateExampleAction,
  ) => void;
  deleteStateExampleOperation: (
    state: DocumentModelGlobalState,
    action: DeleteStateExampleAction,
  ) => void;
  reorderStateExamplesOperation: (
    state: DocumentModelGlobalState,
    action: ReorderStateExamplesAction,
  ) => void;
}

export interface DocumentModelVersioningOperations {
  addChangeLogItemOperation: (
    state: DocumentModelGlobalState,
    action: AddChangeLogItemAction,
  ) => void;
  updateChangeLogItemOperation: (
    state: DocumentModelGlobalState,
    action: UpdateChangeLogItemAction,
  ) => void;
  deleteChangeLogItemOperation: (
    state: DocumentModelGlobalState,
    action: DeleteChangeLogItemAction,
  ) => void;
  reorderChangeLogItemsOperation: (
    state: DocumentModelGlobalState,
    action: ReorderChangeLogItemsAction,
  ) => void;
  releaseNewVersionOperation: (
    state: DocumentModelGlobalState,
    action: ReleaseNewVersionAction,
  ) => void;
}
