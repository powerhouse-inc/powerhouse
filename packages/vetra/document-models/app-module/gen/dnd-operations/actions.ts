import { type Action } from "document-model";
import type {
  SetDragAndDropEnabledInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
} from "../types.js";

export type SetDragAndDropEnabledAction = Action & {
  type: "SET_DRAG_AND_DROP_ENABLED";
  input: SetDragAndDropEnabledInput;
};
export type AddDocumentTypeAction = Action & {
  type: "ADD_DOCUMENT_TYPE";
  input: AddDocumentTypeInput;
};
export type RemoveDocumentTypeAction = Action & {
  type: "REMOVE_DOCUMENT_TYPE";
  input: RemoveDocumentTypeInput;
};

export type AppModuleDndOperationsAction =
  | SetDragAndDropEnabledAction
  | AddDocumentTypeAction
  | RemoveDocumentTypeAction;
