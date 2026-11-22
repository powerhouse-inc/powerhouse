/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddRoleInputSchema,
  AddSpecializedJobStepInputSchema,
  ClearRoleSpecializedJobInputSchema,
  RemoveRoleInputSchema,
  RemoveSpecializedJobStepInputSchema,
  ReorderRolesInputSchema,
  ReorderSpecializedJobStepsInputSchema,
  SetRoleSpecializedJobInputSchema,
  UpdateRoleInputSchema,
  UpdateRoleSpecializedJobInputSchema,
  UpdateSpecializedJobStepInputSchema,
} from "../schema/zod.js";
import type {
  AddRoleInput,
  AddSpecializedJobStepInput,
  ClearRoleSpecializedJobInput,
  RemoveRoleInput,
  RemoveSpecializedJobStepInput,
  ReorderRolesInput,
  ReorderSpecializedJobStepsInput,
  SetRoleSpecializedJobInput,
  UpdateRoleInput,
  UpdateRoleSpecializedJobInput,
  UpdateSpecializedJobStepInput,
} from "../types.js";
import type {
  AddRoleAction,
  AddSpecializedJobStepAction,
  ClearRoleSpecializedJobAction,
  RemoveRoleAction,
  RemoveSpecializedJobStepAction,
  ReorderRolesAction,
  ReorderSpecializedJobStepsAction,
  SetRoleSpecializedJobAction,
  UpdateRoleAction,
  UpdateRoleSpecializedJobAction,
  UpdateSpecializedJobStepAction,
} from "./actions.js";

export const addRole = (input: AddRoleInput) =>
  createAction<AddRoleAction>(
    "ADD_ROLE",
    { ...input },
    undefined,
    AddRoleInputSchema,
    "global",
  );

export const updateRole = (input: UpdateRoleInput) =>
  createAction<UpdateRoleAction>(
    "UPDATE_ROLE",
    { ...input },
    undefined,
    UpdateRoleInputSchema,
    "global",
  );

export const removeRole = (input: RemoveRoleInput) =>
  createAction<RemoveRoleAction>(
    "REMOVE_ROLE",
    { ...input },
    undefined,
    RemoveRoleInputSchema,
    "global",
  );

export const reorderRoles = (input: ReorderRolesInput) =>
  createAction<ReorderRolesAction>(
    "REORDER_ROLES",
    { ...input },
    undefined,
    ReorderRolesInputSchema,
    "global",
  );

export const setRoleSpecializedJob = (input: SetRoleSpecializedJobInput) =>
  createAction<SetRoleSpecializedJobAction>(
    "SET_ROLE_SPECIALIZED_JOB",
    { ...input },
    undefined,
    SetRoleSpecializedJobInputSchema,
    "global",
  );

export const updateRoleSpecializedJob = (
  input: UpdateRoleSpecializedJobInput,
) =>
  createAction<UpdateRoleSpecializedJobAction>(
    "UPDATE_ROLE_SPECIALIZED_JOB",
    { ...input },
    undefined,
    UpdateRoleSpecializedJobInputSchema,
    "global",
  );

export const clearRoleSpecializedJob = (input: ClearRoleSpecializedJobInput) =>
  createAction<ClearRoleSpecializedJobAction>(
    "CLEAR_ROLE_SPECIALIZED_JOB",
    { ...input },
    undefined,
    ClearRoleSpecializedJobInputSchema,
    "global",
  );

export const addSpecializedJobStep = (input: AddSpecializedJobStepInput) =>
  createAction<AddSpecializedJobStepAction>(
    "ADD_SPECIALIZED_JOB_STEP",
    { ...input },
    undefined,
    AddSpecializedJobStepInputSchema,
    "global",
  );

export const updateSpecializedJobStep = (
  input: UpdateSpecializedJobStepInput,
) =>
  createAction<UpdateSpecializedJobStepAction>(
    "UPDATE_SPECIALIZED_JOB_STEP",
    { ...input },
    undefined,
    UpdateSpecializedJobStepInputSchema,
    "global",
  );

export const removeSpecializedJobStep = (
  input: RemoveSpecializedJobStepInput,
) =>
  createAction<RemoveSpecializedJobStepAction>(
    "REMOVE_SPECIALIZED_JOB_STEP",
    { ...input },
    undefined,
    RemoveSpecializedJobStepInputSchema,
    "global",
  );

export const reorderSpecializedJobSteps = (
  input: ReorderSpecializedJobStepsInput,
) =>
  createAction<ReorderSpecializedJobStepsAction>(
    "REORDER_SPECIALIZED_JOB_STEPS",
    { ...input },
    undefined,
    ReorderSpecializedJobStepsInputSchema,
    "global",
  );
