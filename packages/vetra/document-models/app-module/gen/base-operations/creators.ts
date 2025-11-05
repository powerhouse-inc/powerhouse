import { createAction } from "document-model/core";
import {
  SetAppNameInputSchema,
  SetAppStatusInputSchema,
  AddDocumentTypeInputSchema,
  RemoveDocumentTypeInputSchema,
  SetDocumentTypesInputSchema,
} from "../schema/zod.js";
import type {
  SetAppNameInput,
  SetAppStatusInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetDocumentTypesInput,
} from "../types.js";
import type {
  SetAppNameAction,
  SetAppStatusAction,
  AddDocumentTypeAction,
  RemoveDocumentTypeAction,
  SetDocumentTypesAction,
} from "./actions.js";

export const setAppName = (input: SetAppNameInput) =>
  createAction<SetAppNameAction>(
    "SET_APP_NAME",
    { ...input },
    undefined,
    SetAppNameInputSchema,
    "global",
  );

export const setAppStatus = (input: SetAppStatusInput) =>
  createAction<SetAppStatusAction>(
    "SET_APP_STATUS",
    { ...input },
    undefined,
    SetAppStatusInputSchema,
    "global",
  );

export const addDocumentType = (input: AddDocumentTypeInput) =>
  createAction<AddDocumentTypeAction>(
    "ADD_DOCUMENT_TYPE",
    { ...input },
    undefined,
    AddDocumentTypeInputSchema,
    "global",
  );

export const removeDocumentType = (input: RemoveDocumentTypeInput) =>
  createAction<RemoveDocumentTypeAction>(
    "REMOVE_DOCUMENT_TYPE",
    { ...input },
    undefined,
    RemoveDocumentTypeInputSchema,
    "global",
  );

export const setDocumentTypes = (input: SetDocumentTypesInput) =>
  createAction<SetDocumentTypesAction>(
    "SET_DOCUMENT_TYPES",
    { ...input },
    undefined,
    SetDocumentTypesInputSchema,
    "global",
  );
