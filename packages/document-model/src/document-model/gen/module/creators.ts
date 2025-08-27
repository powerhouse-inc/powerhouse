import { createAction } from "document-model";
import type {
  AddModuleInput,
  DeleteModuleInput,
  ReorderModulesInput,
  SetModuleDescriptionInput,
  SetModuleNameInput,
} from "../schema/index.js";
import { z } from "../schema/index.js";
import type {
  AddModuleAction,
  DeleteModuleAction,
  ReorderModulesAction,
  SetModuleDescriptionAction,
  SetModuleNameAction,
} from "./actions.js";

export const addModule = (input: AddModuleInput) =>
  createAction<AddModuleAction>(
    "ADD_MODULE",
    { ...input },
    undefined,
    z.AddModuleInputSchema,
    "global",
  );

export const setModuleName = (input: SetModuleNameInput) =>
  createAction<SetModuleNameAction>(
    "SET_MODULE_NAME",
    { ...input },
    undefined,
    z.SetModuleNameInputSchema,
    "global",
  );

export const setModuleDescription = (input: SetModuleDescriptionInput) =>
  createAction<SetModuleDescriptionAction>(
    "SET_MODULE_DESCRIPTION",
    { ...input },
    undefined,
    z.SetModuleDescriptionInputSchema,
    "global",
  );

export const deleteModule = (input: DeleteModuleInput) =>
  createAction<DeleteModuleAction>(
    "DELETE_MODULE",
    { ...input },
    undefined,
    z.DeleteModuleInputSchema,
    "global",
  );

export const reorderModules = (input: ReorderModulesInput) =>
  createAction<ReorderModulesAction>(
    "REORDER_MODULES",
    { ...input },
    undefined,
    z.ReorderModulesInputSchema,
    "global",
  );
