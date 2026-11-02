/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  SetManagedByInputSchema,
  SetWorkflowDescriptionInputSchema,
  SetWorkflowNameInputSchema,
  SetWorkflowStatusInputSchema,
} from "../schema/zod.js";
import type {
  SetManagedByInput,
  SetWorkflowDescriptionInput,
  SetWorkflowNameInput,
  SetWorkflowStatusInput,
} from "../types.js";
import type {
  SetManagedByAction,
  SetWorkflowDescriptionAction,
  SetWorkflowNameAction,
  SetWorkflowStatusAction,
} from "./actions.js";

export const setWorkflowName = (input: SetWorkflowNameInput) =>
  createAction<SetWorkflowNameAction>(
    "SET_WORKFLOW_NAME",
    { ...input },
    undefined,
    SetWorkflowNameInputSchema,
    "global",
  );

export const setWorkflowDescription = (input: SetWorkflowDescriptionInput) =>
  createAction<SetWorkflowDescriptionAction>(
    "SET_WORKFLOW_DESCRIPTION",
    { ...input },
    undefined,
    SetWorkflowDescriptionInputSchema,
    "global",
  );

export const setWorkflowStatus = (input: SetWorkflowStatusInput) =>
  createAction<SetWorkflowStatusAction>(
    "SET_WORKFLOW_STATUS",
    { ...input },
    undefined,
    SetWorkflowStatusInputSchema,
    "global",
  );

export const setManagedBy = (input: SetManagedByInput) =>
  createAction<SetManagedByAction>(
    "SET_MANAGED_BY",
    { ...input },
    undefined,
    SetManagedByInputSchema,
    "global",
  );
