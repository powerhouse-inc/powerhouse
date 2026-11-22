/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddOutcomeTargetInputSchema,
  RemoveOutcomeTargetInputSchema,
  ReorderOutcomeTargetsInputSchema,
  UpdateOutcomeTargetInputSchema,
  UpdateOutcomeTargetSnippetInputSchema,
} from "../schema/zod.js";
import type {
  AddOutcomeTargetInput,
  RemoveOutcomeTargetInput,
  ReorderOutcomeTargetsInput,
  UpdateOutcomeTargetInput,
  UpdateOutcomeTargetSnippetInput,
} from "../types.js";
import type {
  AddOutcomeTargetAction,
  RemoveOutcomeTargetAction,
  ReorderOutcomeTargetsAction,
  UpdateOutcomeTargetAction,
  UpdateOutcomeTargetSnippetAction,
} from "./actions.js";

export const addOutcomeTarget = (input: AddOutcomeTargetInput) =>
  createAction<AddOutcomeTargetAction>(
    "ADD_OUTCOME_TARGET",
    { ...input },
    undefined,
    AddOutcomeTargetInputSchema,
    "global",
  );

export const updateOutcomeTarget = (input: UpdateOutcomeTargetInput) =>
  createAction<UpdateOutcomeTargetAction>(
    "UPDATE_OUTCOME_TARGET",
    { ...input },
    undefined,
    UpdateOutcomeTargetInputSchema,
    "global",
  );

export const updateOutcomeTargetSnippet = (
  input: UpdateOutcomeTargetSnippetInput,
) =>
  createAction<UpdateOutcomeTargetSnippetAction>(
    "UPDATE_OUTCOME_TARGET_SNIPPET",
    { ...input },
    undefined,
    UpdateOutcomeTargetSnippetInputSchema,
    "global",
  );

export const removeOutcomeTarget = (input: RemoveOutcomeTargetInput) =>
  createAction<RemoveOutcomeTargetAction>(
    "REMOVE_OUTCOME_TARGET",
    { ...input },
    undefined,
    RemoveOutcomeTargetInputSchema,
    "global",
  );

export const reorderOutcomeTargets = (input: ReorderOutcomeTargetsInput) =>
  createAction<ReorderOutcomeTargetsAction>(
    "REORDER_OUTCOME_TARGETS",
    { ...input },
    undefined,
    ReorderOutcomeTargetsInputSchema,
    "global",
  );
