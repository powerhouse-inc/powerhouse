
import { createAction } from "@document/utils/base.js";
import {
  AddModuleInput,
  SetModuleNameInput,
  SetModuleDescriptionInput,
  DeleteModuleInput,
  ReorderModulesInput,
} from "../schema/types.js";
import {
  AddModuleAction,
  SetModuleNameAction,
  SetModuleDescriptionAction,
  DeleteModuleAction,
  ReorderModulesAction,
} from "./actions.js";

export const addModule = (input: AddModuleInput) =>
  createAction<AddModuleAction>("ADD_MODULE", { ...input });

export const setModuleName = (input: SetModuleNameInput) =>
  createAction<SetModuleNameAction>("SET_MODULE_NAME", { ...input });

export const setModuleDescription = (input: SetModuleDescriptionInput) =>
  createAction<SetModuleDescriptionAction>("SET_MODULE_DESCRIPTION", {
    ...input,
  });

export const deleteModule = (input: DeleteModuleInput) =>
  createAction<DeleteModuleAction>("DELETE_MODULE", { ...input });

export const reorderModules = (input: ReorderModulesInput) =>
  createAction<ReorderModulesAction>("REORDER_MODULES", { ...input });
