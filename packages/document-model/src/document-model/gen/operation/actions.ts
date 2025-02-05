import { BaseAction } from "@document/types.js";
import { AddOperationInput, SetOperationNameInput, SetOperationScopeInput, SetOperationSchemaInput, SetOperationDescriptionInput, SetOperationTemplateInput, SetOperationReducerInput, MoveOperationInput, DeleteOperationInput, ReorderModuleOperationsInput } from "../schema/types.js";


export type AddOperationAction = BaseAction<"ADD_OPERATION", AddOperationInput>;
export type SetOperationNameAction = BaseAction<
  "SET_OPERATION_NAME",
  SetOperationNameInput
>;
export type SetOperationScopeAction = BaseAction<
  "SET_OPERATION_SCOPE",
  SetOperationScopeInput
>;
export type SetOperationSchemaAction = BaseAction<
  "SET_OPERATION_SCHEMA",
  SetOperationSchemaInput
>;
export type SetOperationDescriptionAction = BaseAction<
  "SET_OPERATION_DESCRIPTION",
  SetOperationDescriptionInput
>;
export type SetOperationTemplateAction = BaseAction<
  "SET_OPERATION_TEMPLATE",
  SetOperationTemplateInput
>;
export type SetOperationReducerAction = BaseAction<
  "SET_OPERATION_REDUCER",
  SetOperationReducerInput
>;
export type MoveOperationAction = BaseAction<"MOVE_OPERATION", MoveOperationInput>;
export type DeleteOperationAction = BaseAction<
  "DELETE_OPERATION",
  DeleteOperationInput
>;
export type ReorderModuleOperationsAction = BaseAction<
  "REORDER_MODULE_OPERATIONS",
  ReorderModuleOperationsInput
>;

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
