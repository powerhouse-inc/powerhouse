import type { Draft } from "mutative";
import type { ProcessorFactoryBuilder } from "processors";
import type { FC, ReactNode } from "react";
import type { Action, Attachment, AttachmentRef } from "./actions.js";
import type { PHDocument } from "./documents.js";
import type { Operation } from "./operations.js";
import type {
  ActionSigner,
  AppActionSigner,
  Signature,
  UserActionSigner,
} from "./signatures.js";
import type { PHBaseState } from "./state.js";
import type { UpgradeManifest } from "./upgrades.js";

export type State = {
  examples: CodeExample[];
  initialValue: string;
  schema: string;
};

export type ScopeState = {
  global: State;
  local: State;
};

export type Author = {
  name: string;
  website: string | null;
};

export type OperationErrorSpecification = {
  code: string | null;
  description: string | null;
  id: ID;
  name: string | null;
  template: string | null;
};

export type CodeExample = {
  id: ID;
  value: string;
};

export type OperationSpecification = {
  description: string | null;
  errors: OperationErrorSpecification[];
  examples: CodeExample[];
  id: ID;
  name: string | null;
  reducer: string | null;
  schema: string | null;
  template: string | null;
  scope: string;
};

export type ModuleSpecification = {
  description: string | null;
  id: ID;
  name: string;
  operations: OperationSpecification[];
};

export type DocumentSpecification = {
  changeLog: string[];
  modules: ModuleSpecification[];
  state: ScopeState;
  version: number;
};

export type DocumentModelGlobalState = {
  author: Author;
  description: string;
  extension: string;
  id: string;
  name: string;
  specifications: DocumentSpecification[];
};

export type DocumentModelLocalState = {};

export type DocumentModelPHState = PHBaseState & {
  global: DocumentModelGlobalState;
  local: DocumentModelLocalState;
};

export type DocumentModelDocument = PHDocument<DocumentModelPHState>;

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

export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<T extends Record<string, unknown>, K extends keyof T> = {
  [_ in K]?: never;
};
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
  Address: {
    input: `${string}:0x${string}`;
    output: `${string}:0x${string}`;
  };
  Attachment: { input: string; output: string };
  DateTime: { input: string; output: string };
  Unknown: { input: unknown; output: unknown };
};

export type ID = string;

export type OperationsByScope = Partial<Record<string, Operation[]>>;

export type SkipHeaderOperationIndex = Partial<Pick<OperationIndex, "index">> &
  Pick<OperationIndex, "skip">;
export type UndoRedoAction = SchemaRedoAction | SchemaUndoAction;

export type DocumentFile = {
  __typename?: "DocumentFile";
  data: Scalars["String"]["output"];
  extension: Maybe<Scalars["String"]["output"]>;
  fileName: Maybe<Scalars["String"]["output"]>;
  mimeType: Scalars["String"]["output"];
};

export type IAction = {
  type: Scalars["String"]["output"];
};

export type IDocument = {
  created: Scalars["DateTime"]["output"];
  documentType: Scalars["String"]["output"];
  lastModified: Scalars["DateTime"]["output"];
  name: Scalars["String"]["output"];
  operations: Array<IOperation>;
  revision: Scalars["Int"]["output"];
};

export type IOperation = {
  hash: Scalars["String"]["output"];
  index: Scalars["Int"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type Load_State = "LOAD_STATE";

export type SchemaLoadStateAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: LoadStateActionInput;
  type: Load_State;
  scope: string;
};

export type LoadStateActionInput = {
  operations: Scalars["Int"]["input"];
  state: LoadStateActionStateInput;
};

export type LoadStateActionStateInput = {
  data?: InputMaybe<Scalars["Unknown"]["input"]>;
  name: Scalars["String"]["input"];
};

export type MutationLoadStateArgs = {
  input: SchemaLoadStateAction;
};

export type MutationPruneArgs = {
  input: SchemaPruneAction;
};

export type MutationRedoArgs = {
  input: SchemaRedoAction;
};

export type MutationSetNameArgs = {
  input: SchemaSetNameAction;
};

export type MutationUndoArgs = {
  input: SchemaUndoAction;
};

export type Prune = "PRUNE";

export type SchemaPruneAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: PruneActionInput;
  type: Prune;
  scope: string;
};

export type PruneActionInput = {
  end?: InputMaybe<Scalars["Int"]["input"]>;
  start?: InputMaybe<Scalars["Int"]["input"]>;
};

export type Query = {
  __typename?: "Query";
  document: Maybe<IDocument>;
};

export type Redo = "REDO";

export type RedoActionInput = { count: Scalars["Int"]["input"] };

export type SchemaRedoAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: RedoActionInput;
  type: Redo;
  scope: string;
};

export type Set_Name = "SET_NAME";

export type SetNameActionInput = { name: Scalars["String"]["input"] };

export type SchemaSetNameAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: SetNameActionInput;
  type: Set_Name;
  scope: "global";
};

export type SetNameOperation = IOperation & {
  __typename?: "SetNameOperation";
  hash: Scalars["String"]["output"];
  index: Scalars["Int"]["output"];
  input: Scalars["String"]["output"];
  timestamp: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type Undo = "UNDO";

export type UndoActionInput = { count: Scalars["Int"]["input"] };

export type SchemaUndoAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: UndoActionInput;
  type: Undo;
  scope: string;
};

export type SchemaNOOPAction = {
  id: Scalars["String"]["output"];
  input: Scalars["Unknown"]["input"];
  scope: string;
  timestampUtcMs: Scalars["DateTime"]["output"];
  type: "NOOP";
};

export type LoadStateAction = Action & {
  type: "LOAD_STATE";
  input: LoadStateActionInput;
};
export type PruneAction = Action & { type: "PRUNE"; input: PruneActionInput };
export type RedoAction = Action & {
  type: "REDO";
  input: SchemaRedoAction["input"];
};
export type SetNameAction = Action & {
  type: "SET_NAME";
  input: SchemaSetNameAction["input"];
};
export type UndoAction = Action & {
  type: "UNDO";
  input: SchemaUndoAction["input"];
};
export type NOOPAction = Action & {
  type: "NOOP";
  input: SchemaNOOPAction["input"];
};

export type CreateDocumentActionInput = {
  model: string; // e.g., 'ph/todo'
  version: 0;
  documentId: string; // equals signature when signed; UUID when unsigned
  signing?: {
    signature: string;
    publicKey: JsonWebKey;
    nonce: string;
    createdAtUtcIso: string;
    documentType: string;
  };
  // Optional mutable header fields
  slug?: string;
  name?: string;
  branch?: string;
  meta?: Record<string, unknown>;
  protocolVersions?: { [key: string]: number };
};

export type UpgradeDocumentActionInput = {
  model: string;
  fromVersion: number; // 0 for first upgrade
  toVersion: number; // current model version
  documentId: string;
  initialState?: object; // optional; defaults to model.defaultState()
};

export type DeleteDocumentActionInput = {
  documentId: string;
  propagate?: "none" | "cascade"; // Deletion propagation mode
};

export type AddRelationshipActionInput = {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  metadata?: Record<string, unknown>;
};

export type RemoveRelationshipActionInput = {
  sourceId: string;
  targetId: string;
  relationshipType: string;
};

export type CreateDocumentAction = Action & {
  type: "CREATE_DOCUMENT";
  input: CreateDocumentActionInput;
};

export type UpgradeDocumentAction = Action & {
  type: "UPGRADE_DOCUMENT";
  input: UpgradeDocumentActionInput;
};

export type DeleteDocumentAction = Action & {
  type: "DELETE_DOCUMENT";
  input: DeleteDocumentActionInput;
};

export type AddRelationshipAction = Action & {
  type: "ADD_RELATIONSHIP";
  input: AddRelationshipActionInput;
};

export type RemoveRelationshipAction = Action & {
  type: "REMOVE_RELATIONSHIP";
  input: RemoveRelationshipActionInput;
};

export type DocumentAction =
  | LoadStateAction
  | PruneAction
  | RedoAction
  | SetNameAction
  | UndoAction
  | NOOPAction;

export interface ISignal<TType extends string, TInput> {
  type: TType;
  input: TInput;
}

export type ISignalResult<TTYpe, TInput, TResult> = {
  signal: { type: TTYpe; input: TInput };
  result: TResult;
};

export type CreateChildDocumentInput = {
  id: string;
  documentType: string;
};

export type CreateChildDocumentSignal = ISignal<
  "CREATE_CHILD_DOCUMENT",
  CreateChildDocumentInput
>;

export type DeleteChildDocumentInput = {
  id: string;
};

export type DeleteChildDocumentSignal = ISignal<
  "DELETE_CHILD_DOCUMENT",
  DeleteChildDocumentInput
>;

export type CopyChildDocumentInput = {
  id: string;
  newId: string;
};

export type CopyChildDocumentSignal = ISignal<
  "COPY_CHILD_DOCUMENT",
  CopyChildDocumentInput
>;

export type Signal =
  | CreateChildDocumentSignal
  | CopyChildDocumentSignal
  | DeleteChildDocumentSignal;

export type SignalDispatch = (signal: Signal) => void;

export type SignalResult =
  | ISignalResult<
      CreateChildDocumentSignal["type"],
      CreateChildDocumentSignal["input"],
      PHDocument
    >
  | ISignalResult<
      CopyChildDocumentSignal["type"],
      CopyChildDocumentSignal["input"],
      boolean
    >
  | ISignalResult<
      DeleteChildDocumentSignal["type"],
      DeleteChildDocumentSignal["input"],
      PHDocument
    >;

export type SignalResults = {
  CREATE_CHILD_DOCUMENT: PHDocument;
  COPY_CHILD_DOCUMENT: PHDocument;
  DELETE_CHILD_DOCUMENT: boolean;
};

export type SignalType<T extends Signal> = T["type"];

export type FileInput = string | number[] | Uint8Array | ArrayBuffer | Blob;

export type ReducerOptions = {
  /** The number of operations to skip before this new action is applied. This overrides the skip count in the operation. */
  skip?: number;

  /** When true the skip count is ignored and the action is applied regardless of the skip count */
  ignoreSkipOperations?: boolean;

  /** if true reuses the provided action resulting state instead of replaying it */
  reuseOperationResultingState?: boolean;

  /** if true checks the hashes of the operations */
  checkHashes?: boolean;

  /** Options for performing a replay. */
  replayOptions?: {
    /** The previously created operation to verify against. */
    operation: Operation;
  };

  /** Optional parser for the operation resulting state, uses JSON.parse by default */
  operationResultingStateParser?: <TState>(
    state: string | null | undefined,
  ) => TState;

  /**
   * When true (default), the reducer will prune operations (garbage collect) when processing a skip.
   * When false, it will recompute state for the skip but preserve the existing operations history.
   */
  pruneOnSkip?: boolean;

  /** The branch being operated on. Defaults to "main". */
  branch?: string;

  /**
   * Protocol version controlling undo/redo behavior.
   * - Version 1 (default): Legacy behavior with index reuse
   * - Version 2: Reactor behavior with monotonic indices
   */
  protocolVersion?: number;

  /**
   * When true, skip index contiguity validation during replay.
   * Used for V2 state rebuild where gapped indices are expected.
   */
  skipIndexValidation?: boolean;
};

/**
 * A pure function that takes an action and the previous state
 * of the document and returns the new state.
 */
export type Reducer<TState extends PHBaseState = PHBaseState> = (
  document: PHDocument<TState>,
  action: Action,
  dispatch?: SignalDispatch,
  options?: ReducerOptions,
) => PHDocument<TState>;

export type StateReducer<TState extends PHBaseState = PHBaseState> = (
  state: Draft<TState>,
  action: Action,
  dispatch?: SignalDispatch,
) => TState | undefined;

/**
 * Object that indexes attachments of a Document.
 *
 * @remarks
 * This is used to reduce memory usage to avoid
 * multiple instances of the binary data of the attachments.
 *
 */
export type FileRegistry = Record<AttachmentRef, Attachment>;

export type MappedOperation = {
  ignore: boolean;
  operation: Operation;
};

export type DocumentOperationsIgnoreMap = Record<string, MappedOperation[]>;

export type ActionSignatureContext = {
  documentId: string;
  signer: ActionSigner;
  action: Action;
  previousStateHash: string;
};

export type ActionSigningHandler = (message: Uint8Array) => Promise<Uint8Array>;

export type ActionVerificationHandler = (
  publicKey: string,
  signature: Uint8Array,
  data: Uint8Array,
) => Promise<boolean>;

/**
 * Handler for verifying operation signatures.
 *
 * @param operation - The operation to verify
 * @param publicKey - The public key to verify against (from signer.app.key)
 * @returns Promise that resolves to true if signature is valid, false otherwise
 */
export type SignatureVerificationHandler = (
  operation: Operation,
  publicKey: string,
) => Promise<boolean>;

export type ENSInfo = {
  name?: string;
  avatarUrl?: string;
};

export type User = {
  address: `0x${string}`;
  networkId: string; // CAIP-2
  chainId: number; // CAIP-10
  ens?: ENSInfo;
};

export type PartialRecord<K extends keyof any, T> = {
  [P in K]?: T;
};

export type RevisionsFilter = PartialRecord<string, number>;

export type GetDocumentOptions = ReducerOptions & {
  revisions?: RevisionsFilter;
  checkHashes?: boolean;
};

export type ActionErrorCallback = (error: unknown) => void;

export type EditorDispatch = (
  action: Action,
  onErrorCallback?: ActionErrorCallback,
) => void;

export type EditorProps = {
  children?: ReactNode;
  className?: string;
  document?: PHDocument;
};

export type SubgraphModule = {
  id: string;
  name: string;
  gql: string;
  endpoint: string;
};

export type EditorModule<TProps = any> = {
  Component: FC<EditorProps & TProps>;
  documentTypes: string[];
  config: {
    id: string;
    name: string;
  };
};

export type ValidationError = { message: string; details: object };

export type SkipHeaderOperations = Partial<Record<string, number>>;

export type ReplayDocumentOptions = {
  // if false then reuses the hash from the operations
  // and only checks the final hash of each scope
  checkHashes?: boolean;
  // if true then looks for the latest operation with
  // a resulting state and uses it as a starting point
  reuseOperationResultingState?: boolean;
  // Optional parser for the operation resulting state, uses JSON.parse by default
  operationResultingStateParser?: <TState>(state: string) => TState;
  // When true, skip index contiguity validation during replay.
  // Used for V2 state rebuild where gapped indices are expected.
  skipIndexValidation?: boolean;
};

export type OperationIndex = {
  index: number;
  skip: number;
  id?: string;
  timestampUtcMs?: string;
};

/**
 * Parameters used in a document signature.
 */
export type SigningParameters = {
  documentType: string;
  createdAtUtcIso: string;

  /**
   * The nonce can act as both a salt and a typical nonce.
   */
  nonce: string;
};

/**
 * Describes a signer that can sign both document headers and actions.
 */
export interface ISigner {
  /** The user associated with the signer */
  user?: UserActionSigner;

  /** The app associated with the signer */
  app?: AppActionSigner;

  /** The corresponding public key */
  publicKey: CryptoKey;

  /**
   * Signs raw data (used for document header signing).
   *
   * @param data - The data to sign.
   * @returns The signature of the data.
   */
  sign: (data: Uint8Array) => Promise<Uint8Array>;

  /**
   * Verifies a signature.
   *
   * @param data - The data to verify.
   * @param signature - The signature to verify.
   */
  verify: (data: Uint8Array, signature: Uint8Array) => Promise<void>;

  /**
   * Signs an action (used for operation signing).
   *
   * @param action - The action to sign.
   * @param abortSignal - Optional abort signal to cancel the signing.
   * @returns The signature tuple.
   */
  signAction: (action: Action, abortSignal?: AbortSignal) => Promise<Signature>;
}

export type IsStateOfType<TState> = (state: unknown) => state is TState;

export type AssertIsStateOfType<TState> = (
  state: unknown,
) => asserts state is TState;

export type IsDocumentOfType<TState extends PHBaseState> = (
  document: unknown,
) => document is PHDocument<TState>;
export type AssertIsDocumentOfType<TState extends PHBaseState> = (
  document: unknown,
) => asserts document is PHDocument<TState>;

export type PartialState<TState> = TState | Partial<TState>;

export type CreateState<TState extends PHBaseState = PHBaseState> = (
  state?: PartialState<TState>,
) => TState;

export type SaveToFileHandle = (
  document: PHDocument,
  input: FileSystemFileHandle,
) => void | Promise<void>;

export type SaveToFile = (
  document: PHDocument,
  path: string,
  name?: string,
) => string | Promise<string>;

export type LoadFromInput<TState extends PHBaseState = PHBaseState> = (
  input: FileInput,
) => PHDocument<TState> | Promise<PHDocument<TState>>;

export type LoadFromFile<TState extends PHBaseState = PHBaseState> = (
  path: string,
) => PHDocument<TState> | Promise<PHDocument<TState>>;

export type CreateDocument<TState extends PHBaseState = PHBaseState> = (
  initialState?: Partial<TState>,
  createState?: CreateState<TState>,
) => PHDocument<TState>;

export type MinimalBackupData = {
  documentId: string;
  documentType: string;
  branch: string;
  state: PHBaseState;
  name: string;
};

export type DocumentModelUtils<TState extends PHBaseState = PHBaseState> = {
  fileExtension: string;
  createState: CreateState<TState>;
  createDocument: CreateDocument<TState>;
  loadFromInput: LoadFromInput<TState>;
  saveToFileHandle: SaveToFileHandle;
  isStateOfType: IsStateOfType<TState>;
  assertIsStateOfType: AssertIsStateOfType<TState>;
  isDocumentOfType: IsDocumentOfType<TState>;
  assertIsDocumentOfType: AssertIsDocumentOfType<TState>;
};

export type Actions = Record<string, (...args: any[]) => Action>;

export type DocumentModelModule<TState extends PHBaseState = PHBaseState> = {
  /** optional version field, should be made required */
  version?: number;
  reducer: Reducer<TState>;
  actions: Actions;
  utils: DocumentModelUtils<TState>;
  documentModel: DocumentModelPHState;
};

export type DocumentModelLib<TState extends PHBaseState = PHBaseState> = {
  manifest: Manifest;
  documentModels: DocumentModelModule<TState>[];
  editors: EditorModule[];
  subgraphs?: SubgraphModule[];
  upgradeManifests?: UpgradeManifest<readonly number[]>[] | undefined;
  processorFactory?: ProcessorFactoryBuilder;
};

export type DocumentModelDocumentModelModule =
  DocumentModelModule<DocumentModelPHState>;

export type PowerhouseModule = {
  id: string;
  name: string;
  documentTypes?: string[];
};
export type Publisher = {
  name?: string;
  url?: string;
};

export type Manifest = {
  name: string;
  description?: string;
  category?: string;
  publisher?: Publisher;
  apps?: PowerhouseModule[];
  documentModels?: PowerhouseModule[];
  editors?: PowerhouseModule[];
  processors?: PowerhouseModule[];
  subgraphs?: PowerhouseModule[];
};
