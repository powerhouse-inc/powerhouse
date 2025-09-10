import { createAction } from "../../../document/utils/base.js";
import {
  z,
  type AddOperationErrorInput,
  type DeleteOperationErrorInput,
  type ReorderOperationErrorsInput,
  type SetOperationErrorCodeInput,
  type SetOperationErrorDescriptionInput,
  type SetOperationErrorNameInput,
  type SetOperationErrorTemplateInput,
} from "../schema/index.js";
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
  createAction<AddOperationErrorAction>(
    "ADD_OPERATION_ERROR",
    { ...input },
    undefined,
    z.AddOperationErrorInputSchema,
    "global",
  );

export const setOperationErrorCode = (input: SetOperationErrorCodeInput) =>
  createAction<SetOperationErrorCodeAction>(
    "SET_OPERATION_ERROR_CODE",
    { ...input },
    undefined,
    z.SetOperationErrorCodeInputSchema,
    "global",
  );

export const setOperationErrorName = (input: SetOperationErrorNameInput) =>
  createAction<SetOperationErrorNameAction>(
    "SET_OPERATION_ERROR_NAME",
    { ...input },
    undefined,
    z.SetOperationErrorNameInputSchema,
    "global",
  );

export const setOperationErrorDescription = (
  input: SetOperationErrorDescriptionInput,
) =>
  createAction<SetOperationErrorDescriptionAction>(
    "SET_OPERATION_ERROR_DESCRIPTION",
    { ...input },
    undefined,
    z.SetOperationErrorDescriptionInputSchema,
    "global",
  );

export const setOperationErrorTemplate = (
  input: SetOperationErrorTemplateInput,
) =>
  createAction<SetOperationErrorTemplateAction>(
    "SET_OPERATION_ERROR_TEMPLATE",
    { ...input },
    undefined,
    z.SetOperationErrorTemplateInputSchema,
    "global",
  );

export const deleteOperationError = (input: DeleteOperationErrorInput) =>
  createAction<DeleteOperationErrorAction>(
    "DELETE_OPERATION_ERROR",
    { ...input },
    undefined,
    z.DeleteOperationErrorInputSchema,
    "global",
  );

export const reorderOperationErrors = (input: ReorderOperationErrorsInput) =>
  createAction<ReorderOperationErrorsAction>(
    "REORDER_OPERATION_ERRORS",
    { ...input },
    undefined,
    z.ReorderOperationErrorsInputSchema,
    "global",
  );
