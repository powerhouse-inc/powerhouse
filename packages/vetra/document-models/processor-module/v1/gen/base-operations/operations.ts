/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ProcessorModuleGlobalState } from "../types.js";
import type {
  AddDocumentTypeAction,
  AddProcessorAppAction,
  RemoveDocumentTypeAction,
  RemoveProcessorAppAction,
  SetProcessorNameAction,
  SetProcessorStatusAction,
  SetProcessorTypeAction,
} from "./actions.js";

export interface ProcessorModuleBaseOperationsOperations {
  setProcessorNameOperation: (
    state: ProcessorModuleGlobalState,
    action: SetProcessorNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setProcessorTypeOperation: (
    state: ProcessorModuleGlobalState,
    action: SetProcessorTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  addDocumentTypeOperation: (
    state: ProcessorModuleGlobalState,
    action: AddDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeDocumentTypeOperation: (
    state: ProcessorModuleGlobalState,
    action: RemoveDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  addProcessorAppOperation: (
    state: ProcessorModuleGlobalState,
    action: AddProcessorAppAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeProcessorAppOperation: (
    state: ProcessorModuleGlobalState,
    action: RemoveProcessorAppAction,
    dispatch?: SignalDispatch,
  ) => void;
  setProcessorStatusOperation: (
    state: ProcessorModuleGlobalState,
    action: SetProcessorStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
}
