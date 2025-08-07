import { type Action } from "document-model";
import type {
  SetEditorNameInput,
  SetEditorIdInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
} from "../types.js";

export type SetEditorNameAction = Action & {
  type: "SET_EDITOR_NAME";
  input: SetEditorNameInput;
};
export type SetEditorIdAction = Action & {
  type: "SET_EDITOR_ID";
  input: SetEditorIdInput;
};
export type AddDocumentTypeAction = Action & {
  type: "ADD_DOCUMENT_TYPE";
  input: AddDocumentTypeInput;
};
export type RemoveDocumentTypeAction = Action & {
  type: "REMOVE_DOCUMENT_TYPE";
  input: RemoveDocumentTypeInput;
};

export type DocumentEditorBaseOperationsAction =
  | SetEditorNameAction
  | SetEditorIdAction
  | AddDocumentTypeAction
  | RemoveDocumentTypeAction;
