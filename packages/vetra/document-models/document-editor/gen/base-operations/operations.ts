import { type SignalDispatch } from "document-model";
import {
  type SetEditorNameAction,
  type SetEditorIdAction,
  type AddDocumentTypeAction,
  type RemoveDocumentTypeAction,
} from "./actions.js";
import { type DocumentEditorState } from "../types.js";

export interface DocumentEditorBaseOperationsOperations {
  setEditorNameOperation: (
    state: DocumentEditorState,
    action: SetEditorNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setEditorIdOperation: (
    state: DocumentEditorState,
    action: SetEditorIdAction,
    dispatch?: SignalDispatch,
  ) => void;
  addDocumentTypeOperation: (
    state: DocumentEditorState,
    action: AddDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeDocumentTypeOperation: (
    state: DocumentEditorState,
    action: RemoveDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
}
