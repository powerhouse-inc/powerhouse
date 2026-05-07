/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { DocumentEditorGlobalState } from "../types.js";
import type {
  AddDocumentTypeAction,
  RemoveDocumentTypeAction,
  SetEditorNameAction,
  SetEditorStatusAction,
} from "./actions.js";

export interface DocumentEditorBaseOperationsOperations {
  setEditorNameOperation: (
    state: DocumentEditorGlobalState,
    action: SetEditorNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  addDocumentTypeOperation: (
    state: DocumentEditorGlobalState,
    action: AddDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeDocumentTypeOperation: (
    state: DocumentEditorGlobalState,
    action: RemoveDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  setEditorStatusOperation: (
    state: DocumentEditorGlobalState,
    action: SetEditorStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
}
