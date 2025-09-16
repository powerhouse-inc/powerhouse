import { createAction } from "document-model";
import { z } from "../types.js";
import type {
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetAppNameInput,
  SetAppStatusInput,
} from "../types.js";
import type {
  AddDocumentTypeAction,
  RemoveDocumentTypeAction,
  SetAppNameAction,
  SetAppStatusAction,
} from "./actions.js";

export const setAppName = (input: SetAppNameInput) =>
  createAction<SetAppNameAction>(
    "SET_APP_NAME",
    { ...input },
    undefined,
    z.SetAppNameInputSchema,
    "global",
  );

export const setAppStatus = (input: SetAppStatusInput) =>
  createAction<SetAppStatusAction>(
    "SET_APP_STATUS",
    { ...input },
    undefined,
    z.SetAppStatusInputSchema,
    "global",
  );

export const addDocumentType = (input: AddDocumentTypeInput) =>
  createAction<AddDocumentTypeAction>(
    "ADD_DOCUMENT_TYPE",
    { ...input },
    undefined,
    z.AddDocumentTypeInputSchema,
    "global",
  );

export const removeDocumentType = (input: RemoveDocumentTypeInput) =>
  createAction<RemoveDocumentTypeAction>(
    "REMOVE_DOCUMENT_TYPE",
    { ...input },
    undefined,
    z.RemoveDocumentTypeInputSchema,
    "global",
  );
