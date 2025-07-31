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

export type AddOperationErrorAction = BaseAction<AddOperationErrorInput> & {
  type: "ADD_OPERATION_ERROR";
};
export type SetOperationErrorCodeAction = BaseAction<SetOperationErrorCodeInput> & {
  type: "SET_OPERATION_ERROR_CODE";
};
export type SetOperationErrorNameAction = BaseAction<SetOperationErrorNameInput> & {
  type: "SET_OPERATION_ERROR_NAME";
};
export type SetOperationErrorDescriptionAction = BaseAction<SetOperationErrorDescriptionInput> & {
  type: "SET_OPERATION_ERROR_DESCRIPTION";
};
export type SetOperationErrorTemplateAction = BaseAction<SetOperationErrorTemplateInput> & {
  type: "SET_OPERATION_ERROR_TEMPLATE";
};
export type DeleteOperationErrorAction = BaseAction<DeleteOperationErrorInput> & {
  type: "DELETE_OPERATION_ERROR";
};
export type ReorderOperationErrorsAction = BaseAction<ReorderOperationErrorsInput> & {
  type: "REORDER_OPERATION_ERRORS";
};

export type DocumentModelOperationErrorAction =
  | AddOperationErrorAction
  | SetOperationErrorCodeAction
  | SetOperationErrorNameAction
  | SetOperationErrorDescriptionAction
  | SetOperationErrorTemplateAction
  | DeleteOperationErrorAction
  | ReorderOperationErrorsAction;
