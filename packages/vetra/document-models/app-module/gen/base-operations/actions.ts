import type { Action } from "document-model";
import type {
  SetAppNameInput,
  SetAppStatusInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
} from "../types.js";

export type SetAppNameAction = Action & {
  type: "SET_APP_NAME";
  input: SetAppNameInput;
};
export type SetAppStatusAction = Action & {
  type: "SET_APP_STATUS";
  input: SetAppStatusInput;
};
export type AddDocumentTypeAction = Action & {
  type: "ADD_DOCUMENT_TYPE";
  input: AddDocumentTypeInput;
};
export type RemoveDocumentTypeAction = Action & {
  type: "REMOVE_DOCUMENT_TYPE";
  input: RemoveDocumentTypeInput;
};

export type AppModuleBaseOperationsAction =
  | SetAppNameAction
  | SetAppStatusAction
  | AddDocumentTypeAction
  | RemoveDocumentTypeAction;
