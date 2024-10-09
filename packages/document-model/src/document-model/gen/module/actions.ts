import { Action } from "../../../document";
import {
  AddModuleInput,
  SetModuleNameInput,
  SetModuleDescriptionInput,
  DeleteModuleInput,
  ReorderModulesInput,
} from "../types";

export type AddModuleAction = Action<"ADD_MODULE", AddModuleInput>;
export type SetModuleNameAction = Action<"SET_MODULE_NAME", SetModuleNameInput>;
export type SetModuleDescriptionAction = Action<
  "SET_MODULE_DESCRIPTION",
  SetModuleDescriptionInput
>;
export type DeleteModuleAction = Action<"DELETE_MODULE", DeleteModuleInput>;
export type ReorderModulesAction = Action<
  "REORDER_MODULES",
  ReorderModulesInput
>;

export type DocumentModelModuleAction =
  | AddModuleAction
  | SetModuleNameAction
  | SetModuleDescriptionAction
  | DeleteModuleAction
  | ReorderModulesAction;
