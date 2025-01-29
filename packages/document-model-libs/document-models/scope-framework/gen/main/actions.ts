import { Action } from "document-model/document";
import {
  SetRootPathInput,
  AddElementInput,
  UpdateElementTypeInput,
  UpdateElementNameInput,
  UpdateElementComponentsInput,
  RemoveElementInput,
  ReorderElementsInput,
  MoveElementInput,
} from "../types";

export type SetRootPathAction = Action<
  "SET_ROOT_PATH",
  SetRootPathInput,
  "global"
>;
export type AddElementAction = Action<"ADD_ELEMENT", AddElementInput, "global">;
export type UpdateElementTypeAction = Action<
  "UPDATE_ELEMENT_TYPE",
  UpdateElementTypeInput,
  "global"
>;
export type UpdateElementNameAction = Action<
  "UPDATE_ELEMENT_NAME",
  UpdateElementNameInput,
  "global"
>;
export type UpdateElementComponentsAction = Action<
  "UPDATE_ELEMENT_COMPONENTS",
  UpdateElementComponentsInput,
  "global"
>;
export type RemoveElementAction = Action<
  "REMOVE_ELEMENT",
  RemoveElementInput,
  "global"
>;
export type ReorderElementsAction = Action<
  "REORDER_ELEMENTS",
  ReorderElementsInput,
  "global"
>;
export type MoveElementAction = Action<
  "MOVE_ELEMENT",
  MoveElementInput,
  "global"
>;

export type ScopeFrameworkMainAction =
  | SetRootPathAction
  | AddElementAction
  | UpdateElementTypeAction
  | UpdateElementNameAction
  | UpdateElementComponentsAction
  | RemoveElementAction
  | ReorderElementsAction
  | MoveElementAction;
