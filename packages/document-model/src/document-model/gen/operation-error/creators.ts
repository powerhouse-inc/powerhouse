import { createAction } from "../../../document/utils/base.js";
import {
  AddOperationErrorInput,
  DeleteOperationErrorInput,
  ReorderOperationErrorsInput,
  SetOperationErrorCodeInput,
  SetOperationErrorDescriptionInput,
  SetOperationErrorNameInput,
  SetOperationErrorTemplateInput,
} from "../schema/types.js";
import {
  AddOperationErrorAction,
  DeleteOperationErrorAction,
  ReorderOperationErrorsAction,
  SetOperationErrorCodeAction,
  SetOperationErrorDescriptionAction,
  SetOperationErrorNameAction,
  SetOperationErrorTemplateAction,
} from "./actions.js";

export const addOperationError = (input: AddOperationErrorInput) =>
  createAction<AddOperationErrorAction>("ADD_OPERATION_ERROR", { ...input });

export const setOperationErrorCode = (input: SetOperationErrorCodeInput) =>
  createAction<SetOperationErrorCodeAction>("SET_OPERATION_ERROR_CODE", {
    ...input,
  });

export const setOperationErrorName = (input: SetOperationErrorNameInput) =>
  createAction<SetOperationErrorNameAction>("SET_OPERATION_ERROR_NAME", {
    ...input,
  });

export const setOperationErrorDescription = (
  input: SetOperationErrorDescriptionInput,
) =>
  createAction<SetOperationErrorDescriptionAction>(
    "SET_OPERATION_ERROR_DESCRIPTION",
    { ...input },
  );

export const setOperationErrorTemplate = (
  input: SetOperationErrorTemplateInput,
) =>
  createAction<SetOperationErrorTemplateAction>(
    "SET_OPERATION_ERROR_TEMPLATE",
    { ...input },
  );

export const deleteOperationError = (input: DeleteOperationErrorInput) =>
  createAction<DeleteOperationErrorAction>("DELETE_OPERATION_ERROR", {
    ...input,
  });

export const reorderOperationErrors = (input: ReorderOperationErrorsInput) =>
  createAction<ReorderOperationErrorsAction>("REORDER_OPERATION_ERRORS", {
    ...input,
  });
