/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  SetWorkflowDescriptionInputSchema,
  SetWorkflowNameInputSchema,
  SetWorkflowStatusInputSchema,
} from "../schema/zod.js";
import type {
  SetWorkflowDescriptionInput,
  SetWorkflowNameInput,
  SetWorkflowStatusInput,
} from "../types.js";
import type {
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
