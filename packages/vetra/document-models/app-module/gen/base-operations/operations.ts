import { type SignalDispatch } from "document-model";
import { type SetAppNameAction, type SetAppStatusAction } from "./actions.js";
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
}
