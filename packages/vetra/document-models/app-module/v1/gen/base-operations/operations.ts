/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { AppModuleGlobalState } from "../types.js";
import type {
  AddDocumentTypeAction,
  RemoveDocumentTypeAction,
  SetAppNameAction,
  SetAppStatusAction,
  SetDocumentTypesAction,
} from "./actions.js";

export interface AppModuleBaseOperationsOperations {
  setAppNameOperation: (
    state: AppModuleGlobalState,
    action: SetAppNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setAppStatusOperation: (
    state: AppModuleGlobalState,
    action: SetAppStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
  addDocumentTypeOperation: (
    state: AppModuleGlobalState,
    action: AddDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeDocumentTypeOperation: (
    state: AppModuleGlobalState,
    action: RemoveDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  setDocumentTypesOperation: (
    state: AppModuleGlobalState,
    action: SetDocumentTypesAction,
    dispatch?: SignalDispatch,
  ) => void;
}
