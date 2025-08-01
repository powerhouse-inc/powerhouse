export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  DateTime: { input: string; output: string };
};

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

export type DocumentModelState = {
  __typename?: "DocumentModelState";
  author: Author;
  description: Scalars["String"]["output"];
  extension: Scalars["String"]["output"];
  id: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  specifications: Array<DocumentSpecification>;
};

export type ScopeState = {
  global: State;
  local: State;
};

export type DocumentModelLocalState = {};

export type DocumentSpecification = {
  __typename?: "DocumentSpecification";
  changeLog: Array<Scalars["String"]["output"]>;
  modules: Array<Module>;
  state: ScopeState;
  version: Scalars["Int"]["output"];
};

export type Module = {
  __typename?: "Module";
  description: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  name: Scalars["String"]["output"];
  operations: Array<Operation>;
};

export type MoveOperationInput = {
  newModuleId: Scalars["ID"]["input"];
  operationId: Scalars["ID"]["input"];
};

export type Mutation = {
  __typename?: "Mutation";
  addChangeLogItemInput: DocumentModelState;
  addModule: DocumentModelState;
  addOperation: DocumentModelState;
  addOperationError: DocumentModelState;
  addOperationExample: DocumentModelState;
  addStateExample: DocumentModelState;
  deleteChangeLogItemInput: DocumentModelState;
  deleteModule: DocumentModelState;
  deleteOperation: DocumentModelState;
  deleteOperationError: DocumentModelState;
  deleteOperationExample: DocumentModelState;
  deleteStateExample: DocumentModelState;
  moveOperation: DocumentModelState;
  releaseNewVersion: DocumentModelState;
  reorderChangeLogItemsInput: DocumentModelState;
  reorderModuleOperations: DocumentModelState;
  reorderModules: DocumentModelState;
  reorderOperationErrors: DocumentModelState;
  reorderOperationExamples: DocumentModelState;
  reorderStateExamples: DocumentModelState;
  setAuthorName: DocumentModelState;
  setAuthorWebsite: DocumentModelState;
  setInitialState: DocumentModelState;
  setModelDescription: DocumentModelState;
  setModelExtension: DocumentModelState;
  setModelId: DocumentModelState;
  setModelName: DocumentModelState;
  setModuleDescription: DocumentModelState;
  setModuleName: DocumentModelState;
  setOperationDescription: DocumentModelState;
  setOperationErrorCode: DocumentModelState;
  setOperationErrorDescription: DocumentModelState;
  setOperationErrorName: DocumentModelState;
  setOperationErrorTemplate: DocumentModelState;
  setOperationName: DocumentModelState;
  setOperationReducer: DocumentModelState;
  setOperationSchema: DocumentModelState;
  setOperationTemplate: DocumentModelState;
  setStateSchema: DocumentModelState;
  updateChangeLogItemInput: DocumentModelState;
  updateOperationExample: DocumentModelState;
  updateStateExample: DocumentModelState;
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

export type Operation = {
  __typename?: "Operation";
  description: Maybe<Scalars["String"]["output"]>;
  errors: Array<OperationError>;
  examples: Array<CodeExample>;
  id: Scalars["ID"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
  reducer: Maybe<Scalars["String"]["output"]>;
  schema: Maybe<Scalars["String"]["output"]>;
  template: Maybe<Scalars["String"]["output"]>;
  scope: string;
};

export type OperationError = {
  __typename?: "OperationError";
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
  scope: InputMaybe<string>;
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
