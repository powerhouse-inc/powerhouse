import type { Action } from "document-model";
import type {
  SetProcessorNameInput,
  SetProcessorTypeInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  AddProcessorAppInput,
  RemoveProcessorAppInput,
  SetProcessorStatusInput,
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
export type AddProcessorAppAction = Action & {
  type: "ADD_PROCESSOR_APP";
  input: AddProcessorAppInput;
};
export type RemoveProcessorAppAction = Action & {
  type: "REMOVE_PROCESSOR_APP";
  input: RemoveProcessorAppInput;
};
export type SetProcessorStatusAction = Action & {
  type: "SET_PROCESSOR_STATUS";
  input: SetProcessorStatusInput;
};

export type ProcessorModuleBaseOperationsAction =
  | SetProcessorNameAction
  | SetProcessorTypeAction
  | AddDocumentTypeAction
  | RemoveDocumentTypeAction
  | AddProcessorAppAction
  | RemoveProcessorAppAction
  | SetProcessorStatusAction;
