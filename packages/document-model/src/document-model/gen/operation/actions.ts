import { BaseAction } from "../../../document/types.js";
import {
  AddOperationInput,
  DeleteOperationInput,
  MoveOperationInput,
  ReorderModuleOperationsInput,
  SetOperationDescriptionInput,
  SetOperationNameInput,
  SetOperationReducerInput,
  SetOperationSchemaInput,
  SetOperationScopeInput,
  SetOperationTemplateInput,
} from "../schema/types.js";

export type AddOperationAction = BaseAction<AddOperationInput> & {
  type: "ADD_OPERATION";
};
export type SetOperationNameAction = BaseAction<SetOperationNameInput> & {
  type: "SET_OPERATION_NAME";
};
export type SetOperationScopeAction = BaseAction<SetOperationScopeInput> & {
  type: "SET_OPERATION_SCOPE";
};
export type SetOperationSchemaAction = BaseAction<SetOperationSchemaInput> & {
  type: "SET_OPERATION_SCHEMA";
};
export type SetOperationDescriptionAction = BaseAction<SetOperationDescriptionInput> & {
  type: "SET_OPERATION_DESCRIPTION";
};
export type SetOperationTemplateAction = BaseAction<SetOperationTemplateInput> & {
  type: "SET_OPERATION_TEMPLATE";
};
export type SetOperationReducerAction = BaseAction<SetOperationReducerInput> & {
  type: "SET_OPERATION_REDUCER";
};
export type MoveOperationAction = BaseAction<MoveOperationInput> & {
  type: "MOVE_OPERATION";
};
export type DeleteOperationAction = BaseAction<DeleteOperationInput> & {
  type: "DELETE_OPERATION";
};
export type ReorderModuleOperationsAction = BaseAction<ReorderModuleOperationsInput> & {
  type: "REORDER_MODULE_OPERATIONS";
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
