import { type Action } from "../../../document/types.js";
import {
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
} from "../schema/types.js";

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
