import { type Action } from "document-model";
import type { SetDragAndDropEnabledInput } from "../types.js";

export type SetDragAndDropEnabledAction = Action & {
  type: "SET_DRAG_AND_DROP_ENABLED";
  input: SetDragAndDropEnabledInput;
};

export type AppModuleDndOperationsAction = SetDragAndDropEnabledAction;
