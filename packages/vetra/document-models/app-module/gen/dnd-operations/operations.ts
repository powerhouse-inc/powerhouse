import { type SignalDispatch } from "document-model";
import { type SetDragAndDropEnabledAction } from "./actions.js";
import { type AppModuleState } from "../types.js";

export interface AppModuleDndOperationsOperations {
  setDragAndDropEnabledOperation: (
    state: AppModuleState,
    action: SetDragAndDropEnabledAction,
    dispatch?: SignalDispatch,
  ) => void;
}
