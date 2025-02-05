import {
    SetRootPathInput,
    AddElementInput,
    UpdateElementTypeInput,
    UpdateElementNameInput,
    UpdateElementComponentsInput,
    RemoveElementInput,
    ReorderElementsInput,
    MoveElementInput,
} from "../types.js";

export type SetRootPathAction = BaseAction<
  "SET_ROOT_PATH",
  SetRootPathInput,
  "global"
>;
export type AddElementAction = BaseAction<"ADD_ELEMENT", AddElementInput, "global">;
export type UpdateElementTypeAction = BaseAction<
  "UPDATE_ELEMENT_TYPE",
  UpdateElementTypeInput,
  "global"
>;
export type UpdateElementNameAction = BaseAction<
  "UPDATE_ELEMENT_NAME",
  UpdateElementNameInput,
  "global"
>;
export type UpdateElementComponentsAction = BaseAction<
  "UPDATE_ELEMENT_COMPONENTS",
  UpdateElementComponentsInput,
  "global"
>;
export type RemoveElementAction = BaseAction<
  "REMOVE_ELEMENT",
  RemoveElementInput,
  "global"
>;
export type ReorderElementsAction = BaseAction<
  "REORDER_ELEMENTS",
  ReorderElementsInput,
  "global"
>;
export type MoveElementAction = BaseAction<
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
