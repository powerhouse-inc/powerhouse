import { createAction } from "../../../document/utils/base.js";
import {
  z,
  type AddOperationInput,
  type DeleteOperationInput,
  type MoveOperationInput,
  type ReorderModuleOperationsInput,
  type SetOperationDescriptionInput,
  type SetOperationNameInput,
  type SetOperationReducerInput,
  type SetOperationSchemaInput,
  type SetOperationScopeInput,
  type SetOperationTemplateInput,
} from "../schema/index.js";
import {
  AddOperationAction,
  DeleteOperationAction,
  MoveOperationAction,
  ReorderModuleOperationsAction,
  SetOperationDescriptionAction,
  SetOperationNameAction,
  SetOperationReducerAction,
  SetOperationSchemaAction,
  SetOperationScopeAction,
  SetOperationTemplateAction,
} from "./actions.js";

export const addOperation = (input: AddOperationInput) =>
  createAction<AddOperationAction>(
    "ADD_OPERATION",
    { ...input },
    undefined,
    z.AddOperationInputSchema,
    "global",
  );

export const setOperationName = (input: SetOperationNameInput) =>
  createAction<SetOperationNameAction>(
    "SET_OPERATION_NAME",
    { ...input },
    undefined,
    z.SetOperationNameInputSchema,
    "global",
  );

export const setOperationScope = (input: SetOperationScopeInput) =>
  createAction<SetOperationScopeAction>(
    "SET_OPERATION_SCOPE",
    { ...input },
    undefined,
    z.SetOperationScopeInputSchema,
    "global",
  );

export const setOperationSchema = (input: SetOperationSchemaInput) =>
  createAction<SetOperationSchemaAction>(
    "SET_OPERATION_SCHEMA",
    { ...input },
    undefined,
    z.SetOperationSchemaInputSchema,
    "global",
  );

export const setOperationDescription = (input: SetOperationDescriptionInput) =>
  createAction<SetOperationDescriptionAction>(
    "SET_OPERATION_DESCRIPTION",
    { ...input },
    undefined,
    z.SetOperationDescriptionInputSchema,
    "global",
  );

export const setOperationTemplate = (input: SetOperationTemplateInput) =>
  createAction<SetOperationTemplateAction>(
    "SET_OPERATION_TEMPLATE",
    { ...input },
    undefined,
    z.SetOperationTemplateInputSchema,
    "global",
  );

export const setOperationReducer = (input: SetOperationReducerInput) =>
  createAction<SetOperationReducerAction>(
    "SET_OPERATION_REDUCER",
    { ...input },
    undefined,
    z.SetOperationReducerInputSchema,
    "global",
  );

export const moveOperation = (input: MoveOperationInput) =>
  createAction<MoveOperationAction>(
    "MOVE_OPERATION",
    { ...input },
    undefined,
    z.MoveOperationInputSchema,
    "global",
  );

export const deleteOperation = (input: DeleteOperationInput) =>
  createAction<DeleteOperationAction>(
    "DELETE_OPERATION",
    { ...input },
    undefined,
    z.DeleteOperationInputSchema,
    "global",
  );

export const reorderModuleOperations = (input: ReorderModuleOperationsInput) =>
  createAction<ReorderModuleOperationsAction>(
    "REORDER_MODULE_OPERATIONS",
    { ...input },
    undefined,
    z.ReorderModuleOperationsInputSchema,
    "global",
  );
