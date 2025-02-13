import { BaseAction } from "../../../document/types.js";
import {
  AddOperationErrorInput,
  DeleteOperationErrorInput,
  ReorderOperationErrorsInput,
  SetOperationErrorCodeInput,
  SetOperationErrorDescriptionInput,
  SetOperationErrorNameInput,
  SetOperationErrorTemplateInput,
} from "../schema/types.js";

export type AddOperationErrorAction = BaseAction<
  "ADD_OPERATION_ERROR",
  AddOperationErrorInput
>;
export type SetOperationErrorCodeAction = BaseAction<
  "SET_OPERATION_ERROR_CODE",
  SetOperationErrorCodeInput
>;
export type SetOperationErrorNameAction = BaseAction<
  "SET_OPERATION_ERROR_NAME",
  SetOperationErrorNameInput
>;
export type SetOperationErrorDescriptionAction = BaseAction<
  "SET_OPERATION_ERROR_DESCRIPTION",
  SetOperationErrorDescriptionInput
>;
export type SetOperationErrorTemplateAction = BaseAction<
  "SET_OPERATION_ERROR_TEMPLATE",
  SetOperationErrorTemplateInput
>;
export type DeleteOperationErrorAction = BaseAction<
  "DELETE_OPERATION_ERROR",
  DeleteOperationErrorInput
>;
export type ReorderOperationErrorsAction = BaseAction<
  "REORDER_OPERATION_ERRORS",
  ReorderOperationErrorsInput
>;

export type DocumentModelOperationErrorAction =
  | AddOperationErrorAction
  | SetOperationErrorCodeAction
  | SetOperationErrorNameAction
  | SetOperationErrorDescriptionAction
  | SetOperationErrorTemplateAction
  | DeleteOperationErrorAction
  | ReorderOperationErrorsAction;
