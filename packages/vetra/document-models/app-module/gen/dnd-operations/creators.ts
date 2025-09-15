import { createAction } from "document-model";
import {
  z,
  type SetDragAndDropEnabledInput,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
} from "../types.js";
import {
  type SetDragAndDropEnabledAction,
  type AddDocumentTypeAction,
  type RemoveDocumentTypeAction,
} from "./actions.js";

export const setDragAndDropEnabled = (input: SetDragAndDropEnabledInput) =>
  createAction<SetDragAndDropEnabledAction>(
    "SET_DRAG_AND_DROP_ENABLED",
    { ...input },
    undefined,
    z.SetDragAndDropEnabledInputSchema,
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
