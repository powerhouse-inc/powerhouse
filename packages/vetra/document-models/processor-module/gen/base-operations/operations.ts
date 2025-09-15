import type { SignalDispatch } from "document-model";
import type {
  SetProcessorNameAction,
  SetProcessorTypeAction,
  AddDocumentTypeAction,
  RemoveDocumentTypeAction,
  SetProcessorStatusAction,
} from "./actions.js";
import type { ProcessorModuleState } from "../types.js";

export interface ProcessorModuleBaseOperationsOperations {
  setProcessorNameOperation: (
    state: ProcessorModuleState,
    action: SetProcessorNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setProcessorTypeOperation: (
    state: ProcessorModuleState,
    action: SetProcessorTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  addDocumentTypeOperation: (
    state: ProcessorModuleState,
    action: AddDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeDocumentTypeOperation: (
    state: ProcessorModuleState,
    action: RemoveDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  setProcessorStatusOperation: (
    state: ProcessorModuleState,
    action: SetProcessorStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
}
