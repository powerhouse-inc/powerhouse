import { createAction } from "document-model/core";
import {
  SetEditorNameInputSchema,
  AddDocumentTypeInputSchema,
  RemoveDocumentTypeInputSchema,
  SetEditorStatusInputSchema,
} from "../schema/zod.js";
import type {
  SetEditorNameInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetEditorStatusInput,
} from "../types.js";
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
    SetEditorNameInputSchema,
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

export const setEditorStatus = (input: SetEditorStatusInput) =>
  createAction<SetEditorStatusAction>(
    "SET_EDITOR_STATUS",
    { ...input },
    undefined,
    SetEditorStatusInputSchema,
    "global",
  );
