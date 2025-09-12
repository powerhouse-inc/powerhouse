import type {
  AddOperationErrorAction,
  AddOperationErrorInput,
  DeleteOperationErrorAction,
  DeleteOperationErrorInput,
  ReorderOperationErrorsAction,
  ReorderOperationErrorsInput,
  SetOperationErrorCodeAction,
  SetOperationErrorCodeInput,
  SetOperationErrorDescriptionAction,
  SetOperationErrorDescriptionInput,
  SetOperationErrorNameAction,
  SetOperationErrorNameInput,
  SetOperationErrorTemplateAction,
  SetOperationErrorTemplateInput,
} from "document-model";
import {
  AddOperationErrorInputSchema,
  createAction,
  DeleteOperationErrorInputSchema,
  ReorderOperationErrorsInputSchema,
  SetOperationErrorCodeInputSchema,
  SetOperationErrorDescriptionInputSchema,
  SetOperationErrorNameInputSchema,
  SetOperationErrorTemplateInputSchema,
} from "document-model";

export const addOperationError = (input: AddOperationErrorInput) =>
  createAction<AddOperationErrorAction>(
    "ADD_OPERATION_ERROR",
    { ...input },
    undefined,
    AddOperationErrorInputSchema,
    "global",
  );

export const setOperationErrorCode = (input: SetOperationErrorCodeInput) =>
  createAction<SetOperationErrorCodeAction>(
    "SET_OPERATION_ERROR_CODE",
    { ...input },
    undefined,
    SetOperationErrorCodeInputSchema,
    "global",
  );

export const setOperationErrorName = (input: SetOperationErrorNameInput) =>
  createAction<SetOperationErrorNameAction>(
    "SET_OPERATION_ERROR_NAME",
    { ...input },
    undefined,
    SetOperationErrorNameInputSchema,
    "global",
  );

export const setOperationErrorDescription = (
  input: SetOperationErrorDescriptionInput,
) =>
  createAction<SetOperationErrorDescriptionAction>(
    "SET_OPERATION_ERROR_DESCRIPTION",
    { ...input },
    undefined,
    SetOperationErrorDescriptionInputSchema,
    "global",
  );

export const setOperationErrorTemplate = (
  input: SetOperationErrorTemplateInput,
) =>
  createAction<SetOperationErrorTemplateAction>(
    "SET_OPERATION_ERROR_TEMPLATE",
    { ...input },
    undefined,
    SetOperationErrorTemplateInputSchema,
    "global",
  );

export const deleteOperationError = (input: DeleteOperationErrorInput) =>
  createAction<DeleteOperationErrorAction>(
    "DELETE_OPERATION_ERROR",
    { ...input },
    undefined,
    DeleteOperationErrorInputSchema,
    "global",
  );

export const reorderOperationErrors = (input: ReorderOperationErrorsInput) =>
  createAction<ReorderOperationErrorsAction>(
    "REORDER_OPERATION_ERRORS",
    { ...input },
    undefined,
    ReorderOperationErrorsInputSchema,
    "global",
  );
