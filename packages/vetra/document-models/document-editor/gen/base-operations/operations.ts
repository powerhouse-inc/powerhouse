import { type SignalDispatch } from "document-model";
import {
  type SetEditorNameAction,
  type AddDocumentTypeAction,
  type RemoveDocumentTypeAction,
  type SetEditorStatusAction,
} from "./actions.js";
import { type DocumentEditorState } from "../types.js";

export interface DocumentEditorBaseOperationsOperations {
  setEditorNameOperation: (
    state: DocumentEditorState,
    action: SetEditorNameAction,
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
  setEditorStatusOperation: (
    state: DocumentEditorState,
    action: SetEditorStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
}
