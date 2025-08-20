import { type Action, ActionWithAttachment } from "../../../document/types.js";
import {
  type AddModuleInput,
  type DeleteModuleInput,
  type ReorderModulesInput,
  type SetModuleDescriptionInput,
  type SetModuleNameInput,
} from "../schema/types.js";

export type AddModuleAction = Action & {
  type: "ADD_MODULE";
  input: AddModuleInput;
};
export type SetModuleNameAction = Action & {
  type: "SET_MODULE_NAME";
  input: SetModuleNameInput;
};
export type SetModuleDescriptionAction = Action & {
  type: "SET_MODULE_DESCRIPTION";
  input: SetModuleDescriptionInput;
};
export type DeleteModuleAction = Action & {
  type: "DELETE_MODULE";
  input: DeleteModuleInput;
};
export type ReorderModulesAction = Action & {
  type: "REORDER_MODULES";
  input: ReorderModulesInput;
};

export type DocumentModelModuleAction =
  | AddModuleAction
  | SetModuleNameAction
  | SetModuleDescriptionAction
  | DeleteModuleAction
  | ReorderModulesAction;
