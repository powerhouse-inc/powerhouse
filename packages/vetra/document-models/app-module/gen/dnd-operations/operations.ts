import { type SignalDispatch } from "document-model";
import {
  type SetDragAndDropEnabledAction,
  type AddDocumentTypeAction,
  type RemoveDocumentTypeAction,
} from "./actions.js";
import { type AppModuleState } from "../types.js";

export interface AppModuleDndOperationsOperations {
  setDragAndDropEnabledOperation: (
    state: AppModuleState,
    action: SetDragAndDropEnabledAction,
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
}
