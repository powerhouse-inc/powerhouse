import type {
  AddModuleAction,
  AddModuleInput,
  DeleteModuleAction,
  DeleteModuleInput,
  ReorderModulesAction,
  ReorderModulesInput,
  SetModuleDescriptionAction,
  SetModuleDescriptionInput,
  SetModuleNameAction,
  SetModuleNameInput,
} from "document-model";
import {
  AddModuleInputSchema,
  createAction,
  DeleteModuleInputSchema,
  ReorderModulesInputSchema,
  SetModuleDescriptionInputSchema,
  SetModuleNameInputSchema,
} from "document-model";

export const addModule = (input: AddModuleInput) =>
  createAction<AddModuleAction>(
    "ADD_MODULE",
    { ...input },
    undefined,
    AddModuleInputSchema,
    "global",
  );

export const setModuleName = (input: SetModuleNameInput) =>
  createAction<SetModuleNameAction>(
    "SET_MODULE_NAME",
    { ...input },
    undefined,
    SetModuleNameInputSchema,
    "global",
  );

export const setModuleDescription = (input: SetModuleDescriptionInput) =>
  createAction<SetModuleDescriptionAction>(
    "SET_MODULE_DESCRIPTION",
    { ...input },
    undefined,
    SetModuleDescriptionInputSchema,
    "global",
  );

export const deleteModule = (input: DeleteModuleInput) =>
  createAction<DeleteModuleAction>(
    "DELETE_MODULE",
    { ...input },
    undefined,
    DeleteModuleInputSchema,
    "global",
  );

export const reorderModules = (input: ReorderModulesInput) =>
  createAction<ReorderModulesAction>(
    "REORDER_MODULES",
    { ...input },
    undefined,
    ReorderModulesInputSchema,
    "global",
  );
