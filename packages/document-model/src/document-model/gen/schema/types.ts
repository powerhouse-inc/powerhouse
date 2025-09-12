import type { InputMaybe, Maybe, PHBaseState, Scalars } from "document-model";

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
