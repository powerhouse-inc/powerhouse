import { BaseAction } from "@document/types.js";
import {
    AddModuleInput,
    SetModuleNameInput,
    SetModuleDescriptionInput,
    DeleteModuleInput,
    ReorderModulesInput,
} from "../schema/types.js";

export type AddModuleAction = BaseAction<"ADD_MODULE", AddModuleInput>;
export type SetModuleNameAction = BaseAction<"SET_MODULE_NAME", SetModuleNameInput>;
export type SetModuleDescriptionAction = BaseAction<
  "SET_MODULE_DESCRIPTION",
  SetModuleDescriptionInput
>;
export type DeleteModuleAction = BaseAction<"DELETE_MODULE", DeleteModuleInput>;
export type ReorderModulesAction = BaseAction<
  "REORDER_MODULES",
  ReorderModulesInput
>;

export type DocumentModelModuleAction =
  | AddModuleAction
  | SetModuleNameAction
  | SetModuleDescriptionAction
  | DeleteModuleAction
  | ReorderModulesAction;
