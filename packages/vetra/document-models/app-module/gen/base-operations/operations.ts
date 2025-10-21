import { type SignalDispatch } from "document-model";
import {
  type SetAppNameAction,
  type SetAppStatusAction,
  type AddDocumentTypeAction,
  type RemoveDocumentTypeAction,
  type SetDocumentTypesAction,
} from "./actions.js";
import { type AppModuleState } from "../types.js";

export interface AppModuleBaseOperationsOperations {
  setAppNameOperation: (
    state: AppModuleState,
    action: SetAppNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setAppStatusOperation: (
    state: AppModuleState,
    action: SetAppStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
  addDocumentTypeOperation: (
    state: AppModuleState,
    action: AddDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeDocumentTypeOperation: (
    state: AppModuleState,
    action: RemoveDocumentTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  setDocumentTypesOperation: (
    state: AppModuleState,
    action: SetDocumentTypesAction,
    dispatch?: SignalDispatch,
  ) => void;
}
