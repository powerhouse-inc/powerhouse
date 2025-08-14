import { type Action } from "document-model";
import type {
  SetProcessorNameInput,
  SetProcessorTypeInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
} from "../types.js";

export type SetProcessorNameAction = Action & {
  type: "SET_PROCESSOR_NAME";
  input: SetProcessorNameInput;
};
export type SetProcessorTypeAction = Action & {
  type: "SET_PROCESSOR_TYPE";
  input: SetProcessorTypeInput;
};
export type AddDocumentTypeAction = Action & {
  type: "ADD_DOCUMENT_TYPE";
  input: AddDocumentTypeInput;
};
export type RemoveDocumentTypeAction = Action & {
  type: "REMOVE_DOCUMENT_TYPE";
  input: RemoveDocumentTypeInput;
};

export type ProcessorModuleBaseOperationsAction =
  | SetProcessorNameAction
  | SetProcessorTypeAction
  | AddDocumentTypeAction
  | RemoveDocumentTypeAction;
