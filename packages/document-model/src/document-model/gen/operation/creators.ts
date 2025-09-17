import type {
  AddOperationAction,
  AddOperationInput,
  DeleteOperationAction,
  DeleteOperationInput,
  MoveOperationAction,
  MoveOperationInput,
  ReorderModuleOperationsAction,
  ReorderModuleOperationsInput,
  SetOperationDescriptionAction,
  SetOperationDescriptionInput,
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
} from "document-model";
import {
  AddOperationInputSchema,
  createAction,
  DeleteOperationInputSchema,
  MoveOperationInputSchema,
  ReorderModuleOperationsInputSchema,
  SetOperationDescriptionInputSchema,
  SetOperationNameInputSchema,
  SetOperationReducerInputSchema,
  SetOperationSchemaInputSchema,
  SetOperationScopeInputSchema,
  SetOperationTemplateInputSchema,
} from "document-model";

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
