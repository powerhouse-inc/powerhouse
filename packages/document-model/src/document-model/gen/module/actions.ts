import { BaseAction } from "../../../document/types.js";
import {
  AddModuleInput,
  DeleteModuleInput,
  ReorderModulesInput,
  SetModuleDescriptionInput,
  SetModuleNameInput,
} from "../schema/types.js";

export type AddModuleAction = BaseAction<AddModuleInput> & {
  type: "ADD_MODULE";
};
export type SetModuleNameAction = BaseAction<SetModuleNameInput> & {
  type: "SET_MODULE_NAME";
};
export type SetModuleDescriptionAction = BaseAction<SetModuleDescriptionInput> & {
  type: "SET_MODULE_DESCRIPTION";
};
export type DeleteModuleAction = BaseAction<DeleteModuleInput> & {
  type: "DELETE_MODULE";
};
export type ReorderModulesAction = BaseAction<ReorderModulesInput> & {
  type: "REORDER_MODULES";
};

export type DocumentModelModuleAction =
  | AddModuleAction
  | SetModuleNameAction
  | SetModuleDescriptionAction
  | DeleteModuleAction
  | ReorderModulesAction;
