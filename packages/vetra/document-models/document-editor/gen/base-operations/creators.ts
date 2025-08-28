import { createAction } from "document-model";
import type {
  SetEditorNameInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetEditorStatusInput,
} from "../types.js";
import { z } from "../types.js";
import type {
  SetEditorNameAction,
  AddDocumentTypeAction,
  RemoveDocumentTypeAction,
  SetEditorStatusAction,
} from "./actions.js";

export const setEditorName = (input: SetEditorNameInput) =>
  createAction<SetEditorNameAction>(
    "SET_EDITOR_NAME",
    { ...input },
    undefined,
    z.SetEditorNameInputSchema,
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

export const setEditorStatus = (input: SetEditorStatusInput) =>
  createAction<SetEditorStatusAction>(
    "SET_EDITOR_STATUS",
    { ...input },
    undefined,
    z.SetEditorStatusInputSchema,
    "global",
  );
