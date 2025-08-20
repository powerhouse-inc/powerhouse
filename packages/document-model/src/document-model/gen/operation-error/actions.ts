import { type Action, ActionWithAttachment } from "../../../document/types.js";
import {
  type AddOperationErrorInput,
  type DeleteOperationErrorInput,
  type ReorderOperationErrorsInput,
  type SetOperationErrorCodeInput,
  type SetOperationErrorDescriptionInput,
  type SetOperationErrorNameInput,
  type SetOperationErrorTemplateInput,
} from "../schema/types.js";

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
