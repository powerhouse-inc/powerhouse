import type {
  AddChangeLogItemAction,
  AddChangeLogItemInput,
  AddModuleAction,
  AddModuleInput,
  AddOperationAction,
  AddOperationErrorAction,
  AddOperationErrorInput,
  AddOperationExampleAction,
  AddOperationExampleInput,
  AddOperationInput,
  AddStateExampleAction,
  AddStateExampleInput,
  DeleteChangeLogItemAction,
  DeleteChangeLogItemInput,
  DeleteModuleAction,
  DeleteModuleInput,
  DeleteOperationAction,
  DeleteOperationErrorAction,
  DeleteOperationErrorInput,
  DeleteOperationExampleAction,
  DeleteOperationExampleInput,
  DeleteOperationInput,
  DeleteStateExampleAction,
  DeleteStateExampleInput,
  MoveOperationAction,
  MoveOperationInput,
  ReleaseNewVersionAction,
  ReorderChangeLogItemsAction,
  ReorderChangeLogItemsInput,
  ReorderModuleOperationsAction,
  ReorderModuleOperationsInput,
  ReorderModulesAction,
  ReorderModulesInput,
  ReorderOperationErrorsAction,
  ReorderOperationErrorsInput,
  ReorderOperationExamplesAction,
  ReorderOperationExamplesInput,
  ReorderStateExamplesAction,
  ReorderStateExamplesInput,
  SetAuthorNameAction,
  SetAuthorNameInput,
  SetAuthorWebsiteAction,
  SetAuthorWebsiteInput,
  SetInitialStateAction,
  SetInitialStateInput,
  SetModelDescriptionAction,
  SetModelDescriptionInput,
  SetModelExtensionAction,
  SetModelExtensionInput,
  SetModelIdAction,
  SetModelIdInput,
  SetModelNameAction,
  SetModelNameInput,
  SetModuleDescriptionAction,
  SetModuleDescriptionInput,
  SetModuleNameAction,
  SetModuleNameInput,
  SetNameAction,
  SetOperationDescriptionAction,
  SetOperationDescriptionInput,
  SetOperationErrorCodeAction,
  SetOperationErrorCodeInput,
  SetOperationErrorDescriptionAction,
  SetOperationErrorDescriptionInput,
  SetOperationErrorNameAction,
  SetOperationErrorNameInput,
  SetOperationErrorTemplateAction,
  SetOperationErrorTemplateInput,
  SetOperationNameAction,
  SetOperationNameInput,
  SetOperationReducerAction,
  SetOperationReducerInput,
  SetOperationSchemaAction,
  SetOperationSchemaInput,
  SetOperationScopeAction,
  SetOperationScopeInput,
  SetOperationTemplateAction,
  SetOperationTemplateInput,
  SetStateSchemaAction,
  SetStateSchemaInput,
  UpdateChangeLogItemAction,
  UpdateChangeLogItemInput,
  UpdateOperationExampleAction,
  UpdateOperationExampleInput,
  UpdateStateExampleAction,
  UpdateStateExampleInput,
} from "document-model";
import {
  createAction,
  loadState,
  noop,
  prune,
  redo,
  SetNameActionInputSchema,
  undo,
} from "document-model/core";
import {
  AddChangeLogItemInputSchema,
  AddModuleInputSchema,
  AddOperationErrorInputSchema,
  AddOperationExampleInputSchema,
  AddOperationInputSchema,
  AddStateExampleInputSchema,
  DeleteChangeLogItemInputSchema,
  DeleteModuleInputSchema,
  DeleteOperationErrorInputSchema,
  DeleteOperationExampleInputSchema,
  DeleteOperationInputSchema,
  DeleteStateExampleInputSchema,
  MoveOperationInputSchema,
  ReorderChangeLogItemsInputSchema,
  ReorderModuleOperationsInputSchema,
  ReorderModulesInputSchema,
  ReorderOperationErrorsInputSchema,
  ReorderOperationExamplesInputSchema,
  ReorderStateExamplesInputSchema,
  SetAuthorNameInputSchema,
  SetAuthorWebsiteInputSchema,
  SetInitialStateInputSchema,
  SetModelDescriptionInputSchema,
  SetModelExtensionInputSchema,
  SetModelIdInputSchema,
  SetModelNameInputSchema,
  SetModuleDescriptionInputSchema,
  SetModuleNameInputSchema,
  SetOperationDescriptionInputSchema,
  SetOperationErrorCodeInputSchema,
  SetOperationErrorDescriptionInputSchema,
  SetOperationErrorNameInputSchema,
  SetOperationErrorTemplateInputSchema,
  SetOperationNameInputSchema,
  SetOperationReducerInputSchema,
  SetOperationSchemaInputSchema,
  SetOperationScopeInputSchema,
  SetOperationTemplateInputSchema,
  SetStateSchemaInputSchema,
  UpdateChangeLogItemInputSchema,
  UpdateOperationExampleInputSchema,
  UpdateStateExampleInputSchema,
} from "./schemas.js";
/**
 * Changes the name of the document.
 *
 * @param name - The name to be set in the document.
 * @category Actions
 */
export const setName = (name: string) =>
  createAction<SetNameAction>(
    "SET_NAME",
    { name },
    undefined,
    SetNameActionInputSchema,
    // TODO: THIS IS A BUG: This needs to be changed to a HEADER scope action if it's changing the header.
    "global",
  );
export const setModelName = (input: SetModelNameInput) =>
  createAction<SetModelNameAction>(
    "SET_MODEL_NAME",
    { ...input },
    undefined,
    SetModelNameInputSchema,
    "global",
  );

export const setModelId = (input: SetModelIdInput) =>
  createAction<SetModelIdAction>(
    "SET_MODEL_ID",
    { ...input },
    undefined,
    SetModelIdInputSchema,
    "global",
  );

export const setModelExtension = (input: SetModelExtensionInput) =>
  createAction<SetModelExtensionAction>(
    "SET_MODEL_EXTENSION",
    { ...input },
    undefined,
    SetModelExtensionInputSchema,
    "global",
  );

export const setModelDescription = (input: SetModelDescriptionInput) =>
  createAction<SetModelDescriptionAction>(
    "SET_MODEL_DESCRIPTION",
    { ...input },
    undefined,
    SetModelDescriptionInputSchema,
    "global",
  );

export const setAuthorName = (input: SetAuthorNameInput) =>
  createAction<SetAuthorNameAction>(
    "SET_AUTHOR_NAME",
    { ...input },
    undefined,
    SetAuthorNameInputSchema,
    "global",
  );

export const setAuthorWebsite = (input: SetAuthorWebsiteInput) =>
  createAction<SetAuthorWebsiteAction>(
    "SET_AUTHOR_WEBSITE",
    { ...input },
    undefined,
    SetAuthorWebsiteInputSchema,
    "global",
  );

export const addModule = (input: AddModuleInput) =>
  createAction<AddModuleAction>(
    "ADD_MODULE",
    { ...input },
    undefined,
    AddModuleInputSchema,
    "global",
  );

export const setModuleName = (input: SetModuleNameInput) =>
  createAction<SetModuleNameAction>(
    "SET_MODULE_NAME",
    { ...input },
    undefined,
    SetModuleNameInputSchema,
    "global",
  );

export const setModuleDescription = (input: SetModuleDescriptionInput) =>
  createAction<SetModuleDescriptionAction>(
    "SET_MODULE_DESCRIPTION",
    { ...input },
    undefined,
    SetModuleDescriptionInputSchema,
    "global",
  );

export const deleteModule = (input: DeleteModuleInput) =>
  createAction<DeleteModuleAction>(
    "DELETE_MODULE",
    { ...input },
    undefined,
    DeleteModuleInputSchema,
    "global",
  );

export const reorderModules = (input: ReorderModulesInput) =>
  createAction<ReorderModulesAction>(
    "REORDER_MODULES",
    { ...input },
    undefined,
    ReorderModulesInputSchema,
    "global",
  );

export const addOperation = (input: AddOperationInput) =>
  createAction<AddOperationAction>(
    "ADD_OPERATION",
    { ...input },
    undefined,
    AddOperationInputSchema,
    "global",
  );

export const setOperationName = (input: SetOperationNameInput) =>
  createAction<SetOperationNameAction>(
    "SET_OPERATION_NAME",
    { ...input },
    undefined,
    SetOperationNameInputSchema,
    "global",
  );

export const setOperationScope = (input: SetOperationScopeInput) =>
  createAction<SetOperationScopeAction>(
    "SET_OPERATION_SCOPE",
    { ...input },
    undefined,
    SetOperationScopeInputSchema,
    "global",
  );

export const setOperationSchema = (input: SetOperationSchemaInput) =>
  createAction<SetOperationSchemaAction>(
    "SET_OPERATION_SCHEMA",
    { ...input },
    undefined,
    SetOperationSchemaInputSchema,
    "global",
  );

export const setOperationDescription = (input: SetOperationDescriptionInput) =>
  createAction<SetOperationDescriptionAction>(
    "SET_OPERATION_DESCRIPTION",
    { ...input },
    undefined,
    SetOperationDescriptionInputSchema,
    "global",
  );

export const setOperationTemplate = (input: SetOperationTemplateInput) =>
  createAction<SetOperationTemplateAction>(
    "SET_OPERATION_TEMPLATE",
    { ...input },
    undefined,
    SetOperationTemplateInputSchema,
    "global",
  );

export const setOperationReducer = (input: SetOperationReducerInput) =>
  createAction<SetOperationReducerAction>(
    "SET_OPERATION_REDUCER",
    { ...input },
    undefined,
    SetOperationReducerInputSchema,
    "global",
  );

export const moveOperation = (input: MoveOperationInput) =>
  createAction<MoveOperationAction>(
    "MOVE_OPERATION",
    { ...input },
    undefined,
    MoveOperationInputSchema,
    "global",
  );

export const deleteOperation = (input: DeleteOperationInput) =>
  createAction<DeleteOperationAction>(
    "DELETE_OPERATION",
    { ...input },
    undefined,
    DeleteOperationInputSchema,
    "global",
  );

export const reorderModuleOperations = (input: ReorderModuleOperationsInput) =>
  createAction<ReorderModuleOperationsAction>(
    "REORDER_MODULE_OPERATIONS",
    { ...input },
    undefined,
    ReorderModuleOperationsInputSchema,
    "global",
  );

export const addOperationError = (input: AddOperationErrorInput) =>
  createAction<AddOperationErrorAction>(
    "ADD_OPERATION_ERROR",
    { ...input },
    undefined,
    AddOperationErrorInputSchema,
    "global",
  );

export const setOperationErrorCode = (input: SetOperationErrorCodeInput) =>
  createAction<SetOperationErrorCodeAction>(
    "SET_OPERATION_ERROR_CODE",
    { ...input },
    undefined,
    SetOperationErrorCodeInputSchema,
    "global",
  );

export const setOperationErrorName = (input: SetOperationErrorNameInput) =>
  createAction<SetOperationErrorNameAction>(
    "SET_OPERATION_ERROR_NAME",
    { ...input },
    undefined,
    SetOperationErrorNameInputSchema,
    "global",
  );

export const setOperationErrorDescription = (
  input: SetOperationErrorDescriptionInput,
) =>
  createAction<SetOperationErrorDescriptionAction>(
    "SET_OPERATION_ERROR_DESCRIPTION",
    { ...input },
    undefined,
    SetOperationErrorDescriptionInputSchema,
    "global",
  );

export const setOperationErrorTemplate = (
  input: SetOperationErrorTemplateInput,
) =>
  createAction<SetOperationErrorTemplateAction>(
    "SET_OPERATION_ERROR_TEMPLATE",
    { ...input },
    undefined,
    SetOperationErrorTemplateInputSchema,
    "global",
  );

export const deleteOperationError = (input: DeleteOperationErrorInput) =>
  createAction<DeleteOperationErrorAction>(
    "DELETE_OPERATION_ERROR",
    { ...input },
    undefined,
    DeleteOperationErrorInputSchema,
    "global",
  );

export const reorderOperationErrors = (input: ReorderOperationErrorsInput) =>
  createAction<ReorderOperationErrorsAction>(
    "REORDER_OPERATION_ERRORS",
    { ...input },
    undefined,
    ReorderOperationErrorsInputSchema,
    "global",
  );

export const addOperationExample = (input: AddOperationExampleInput) =>
  createAction<AddOperationExampleAction>(
    "ADD_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    AddOperationExampleInputSchema,
    "global",
  );

export const updateOperationExample = (input: UpdateOperationExampleInput) =>
  createAction<UpdateOperationExampleAction>(
    "UPDATE_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    UpdateOperationExampleInputSchema,
    "global",
  );

export const deleteOperationExample = (input: DeleteOperationExampleInput) =>
  createAction<DeleteOperationExampleAction>(
    "DELETE_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    DeleteOperationExampleInputSchema,
    "global",
  );

export const reorderOperationExamples = (
  input: ReorderOperationExamplesInput,
) =>
  createAction<ReorderOperationExamplesAction>(
    "REORDER_OPERATION_EXAMPLES",
    { ...input },
    undefined,
    ReorderOperationExamplesInputSchema,
    "global",
  );

export const operationExampleCreators = {
  addOperationExample,
  updateOperationExample,
  deleteOperationExample,
  reorderOperationExamples,
};

export const setStateSchema = (input: SetStateSchemaInput) =>
  createAction<SetStateSchemaAction>(
    "SET_STATE_SCHEMA",
    { ...input },
    undefined,
    SetStateSchemaInputSchema,
    "global",
  );

export const setInitialState = (input: SetInitialStateInput) =>
  createAction<SetInitialStateAction>(
    "SET_INITIAL_STATE",
    { ...input },
    undefined,
    SetInitialStateInputSchema,
    "global",
  );

export const addStateExample = (input: AddStateExampleInput) =>
  createAction<AddStateExampleAction>(
    "ADD_STATE_EXAMPLE",
    { ...input },
    undefined,
    AddStateExampleInputSchema,
    "global",
  );

export const updateStateExample = (input: UpdateStateExampleInput) =>
  createAction<UpdateStateExampleAction>(
    "UPDATE_STATE_EXAMPLE",
    { ...input },
    undefined,
    UpdateStateExampleInputSchema,
    "global",
  );

export const deleteStateExample = (input: DeleteStateExampleInput) =>
  createAction<DeleteStateExampleAction>(
    "DELETE_STATE_EXAMPLE",
    { ...input },
    undefined,
    DeleteStateExampleInputSchema,
    "global",
  );

export const reorderStateExamples = (input: ReorderStateExamplesInput) =>
  createAction<ReorderStateExamplesAction>(
    "REORDER_STATE_EXAMPLES",
    { ...input },
    undefined,
    ReorderStateExamplesInputSchema,
    "global",
  );

export const addChangeLogItem = (input: AddChangeLogItemInput) =>
  createAction<AddChangeLogItemAction>(
    "ADD_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    AddChangeLogItemInputSchema,
    "global",
  );

export const updateChangeLogItem = (input: UpdateChangeLogItemInput) =>
  createAction<UpdateChangeLogItemAction>(
    "UPDATE_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    UpdateChangeLogItemInputSchema,
    "global",
  );

export const deleteChangeLogItem = (input: DeleteChangeLogItemInput) =>
  createAction<DeleteChangeLogItemAction>(
    "DELETE_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    DeleteChangeLogItemInputSchema,
    "global",
  );

export const reorderChangeLogItems = (input: ReorderChangeLogItemsInput) =>
  createAction<ReorderChangeLogItemsAction>(
    "REORDER_CHANGE_LOG_ITEMS",
    { ...input },
    undefined,
    ReorderChangeLogItemsInputSchema,
    "global",
  );

export const releaseNewVersion = () =>
  createAction<ReleaseNewVersionAction>(
    "RELEASE_NEW_VERSION",
    {},
    undefined,
    undefined,
    "global",
  );

export const baseActions = {
  setName,
  undo,
  redo,
  prune,
  loadState,
  noop,
};

export const documentModelActions = {
  setModelName,
  setModelId,
  setModelExtension,
  setModelDescription,
  setAuthorName,
  setAuthorWebsite,
  addModule,
  setModuleName,
  setModuleDescription,
  deleteModule,
  reorderModules,
  addOperation,
  setOperationName,
  setOperationScope,
  setOperationSchema,
  setOperationDescription,
  setOperationTemplate,
  setOperationReducer,
  moveOperation,
  deleteOperation,
  reorderModuleOperations,
  addOperationError,
  setOperationErrorCode,
  setOperationErrorName,
  setOperationErrorDescription,
  setOperationErrorTemplate,
  deleteOperationError,
  reorderOperationErrors,
  setStateSchema,
  setInitialState,
  addStateExample,
  updateStateExample,
  deleteStateExample,
  reorderStateExamples,
  addChangeLogItem,
  updateChangeLogItem,
  deleteChangeLogItem,
  reorderChangeLogItems,
  releaseNewVersion,
};

export const actions = { ...baseActions, ...documentModelActions };
