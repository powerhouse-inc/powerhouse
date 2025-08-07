import { createAction } from "document-model";
import {
  z,
  type SetEditorNameInput,
  type SetEditorIdInput,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
} from "../types.js";
import {
  type SetEditorNameAction,
  type SetEditorIdAction,
  type AddDocumentTypeAction,
  type RemoveDocumentTypeAction,
} from "./actions.js";

export const setEditorName = (input: SetEditorNameInput) =>
  createAction<SetEditorNameAction>(
    "SET_EDITOR_NAME",
    { ...input },
    undefined,
    z.SetEditorNameInputSchema,
    "global",
  );

export const setEditorId = (input: SetEditorIdInput) =>
  createAction<SetEditorIdAction>(
    "SET_EDITOR_ID",
    { ...input },
    undefined,
    z.SetEditorIdInputSchema,
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
