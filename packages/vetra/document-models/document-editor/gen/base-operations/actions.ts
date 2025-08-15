import { type Action } from "document-model";
import type {
  SetEditorNameInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetEditorStatusInput,
} from "../types.js";

export type SetEditorNameAction = Action & {
  type: "SET_EDITOR_NAME";
  input: SetEditorNameInput;
};
export type AddDocumentTypeAction = Action & {
  type: "ADD_DOCUMENT_TYPE";
  input: AddDocumentTypeInput;
};
export type RemoveDocumentTypeAction = Action & {
  type: "REMOVE_DOCUMENT_TYPE";
  input: RemoveDocumentTypeInput;
};
export type SetEditorStatusAction = Action & {
  type: "SET_EDITOR_STATUS";
  input: SetEditorStatusInput;
};

export type DocumentEditorBaseOperationsAction =
  | SetEditorNameAction
  | AddDocumentTypeAction
  | RemoveDocumentTypeAction
  | SetEditorStatusAction;
