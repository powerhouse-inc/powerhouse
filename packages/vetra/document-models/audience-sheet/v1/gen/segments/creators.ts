/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddOutcomePriorityInputSchema,
  AddSegmentEvidenceInputSchema,
  AddSegmentInputSchema,
  AddSegmentRoleInputSchema,
  RemoveOutcomePriorityInputSchema,
  RemoveSegmentEvidenceInputSchema,
  RemoveSegmentInputSchema,
  RemoveSegmentRoleInputSchema,
  ReorderOutcomePrioritiesInputSchema,
  ReorderSegmentRolesInputSchema,
  ReorderSegmentsInputSchema,
  UpdateOutcomePriorityInputSchema,
  UpdateOutcomePrioritySnippetInputSchema,
  UpdateSegmentEvidenceInputSchema,
  UpdateSegmentInputSchema,
  UpdateSegmentRoleSnippetInputSchema,
} from "../schema/zod.js";
import type {
  AddOutcomePriorityInput,
  AddSegmentEvidenceInput,
  AddSegmentInput,
  AddSegmentRoleInput,
  RemoveOutcomePriorityInput,
  RemoveSegmentEvidenceInput,
  RemoveSegmentInput,
  RemoveSegmentRoleInput,
  ReorderOutcomePrioritiesInput,
  ReorderSegmentRolesInput,
  ReorderSegmentsInput,
  UpdateOutcomePriorityInput,
  UpdateOutcomePrioritySnippetInput,
  UpdateSegmentEvidenceInput,
  UpdateSegmentInput,
  UpdateSegmentRoleSnippetInput,
} from "../types.js";
import type {
  AddOutcomePriorityAction,
  AddSegmentAction,
  AddSegmentEvidenceAction,
  AddSegmentRoleAction,
  RemoveOutcomePriorityAction,
  RemoveSegmentAction,
  RemoveSegmentEvidenceAction,
  RemoveSegmentRoleAction,
  ReorderOutcomePrioritiesAction,
  ReorderSegmentRolesAction,
  ReorderSegmentsAction,
  UpdateOutcomePriorityAction,
  UpdateOutcomePrioritySnippetAction,
  UpdateSegmentAction,
  UpdateSegmentEvidenceAction,
  UpdateSegmentRoleSnippetAction,
} from "./actions.js";

export const addSegment = (input: AddSegmentInput) =>
  createAction<AddSegmentAction>(
    "ADD_SEGMENT",
    { ...input },
    undefined,
    AddSegmentInputSchema,
    "global",
  );

export const updateSegment = (input: UpdateSegmentInput) =>
  createAction<UpdateSegmentAction>(
    "UPDATE_SEGMENT",
    { ...input },
    undefined,
    UpdateSegmentInputSchema,
    "global",
  );

export const removeSegment = (input: RemoveSegmentInput) =>
  createAction<RemoveSegmentAction>(
    "REMOVE_SEGMENT",
    { ...input },
    undefined,
    RemoveSegmentInputSchema,
    "global",
  );

export const reorderSegments = (input: ReorderSegmentsInput) =>
  createAction<ReorderSegmentsAction>(
    "REORDER_SEGMENTS",
    { ...input },
    undefined,
    ReorderSegmentsInputSchema,
    "global",
  );

export const addSegmentRole = (input: AddSegmentRoleInput) =>
  createAction<AddSegmentRoleAction>(
    "ADD_SEGMENT_ROLE",
    { ...input },
    undefined,
    AddSegmentRoleInputSchema,
    "global",
  );

export const updateSegmentRoleSnippet = (
  input: UpdateSegmentRoleSnippetInput,
) =>
  createAction<UpdateSegmentRoleSnippetAction>(
    "UPDATE_SEGMENT_ROLE_SNIPPET",
    { ...input },
    undefined,
    UpdateSegmentRoleSnippetInputSchema,
    "global",
  );

export const removeSegmentRole = (input: RemoveSegmentRoleInput) =>
  createAction<RemoveSegmentRoleAction>(
    "REMOVE_SEGMENT_ROLE",
    { ...input },
    undefined,
    RemoveSegmentRoleInputSchema,
    "global",
  );

export const reorderSegmentRoles = (input: ReorderSegmentRolesInput) =>
  createAction<ReorderSegmentRolesAction>(
    "REORDER_SEGMENT_ROLES",
    { ...input },
    undefined,
    ReorderSegmentRolesInputSchema,
    "global",
  );

export const addOutcomePriority = (input: AddOutcomePriorityInput) =>
  createAction<AddOutcomePriorityAction>(
    "ADD_OUTCOME_PRIORITY",
    { ...input },
    undefined,
    AddOutcomePriorityInputSchema,
    "global",
  );

export const updateOutcomePriority = (input: UpdateOutcomePriorityInput) =>
  createAction<UpdateOutcomePriorityAction>(
    "UPDATE_OUTCOME_PRIORITY",
    { ...input },
    undefined,
    UpdateOutcomePriorityInputSchema,
    "global",
  );

export const updateOutcomePrioritySnippet = (
  input: UpdateOutcomePrioritySnippetInput,
) =>
  createAction<UpdateOutcomePrioritySnippetAction>(
    "UPDATE_OUTCOME_PRIORITY_SNIPPET",
    { ...input },
    undefined,
    UpdateOutcomePrioritySnippetInputSchema,
    "global",
  );

export const removeOutcomePriority = (input: RemoveOutcomePriorityInput) =>
  createAction<RemoveOutcomePriorityAction>(
    "REMOVE_OUTCOME_PRIORITY",
    { ...input },
    undefined,
    RemoveOutcomePriorityInputSchema,
    "global",
  );

export const reorderOutcomePriorities = (
  input: ReorderOutcomePrioritiesInput,
) =>
  createAction<ReorderOutcomePrioritiesAction>(
    "REORDER_OUTCOME_PRIORITIES",
    { ...input },
    undefined,
    ReorderOutcomePrioritiesInputSchema,
    "global",
  );

export const addSegmentEvidence = (input: AddSegmentEvidenceInput) =>
  createAction<AddSegmentEvidenceAction>(
    "ADD_SEGMENT_EVIDENCE",
    { ...input },
    undefined,
    AddSegmentEvidenceInputSchema,
    "global",
  );

export const updateSegmentEvidence = (input: UpdateSegmentEvidenceInput) =>
  createAction<UpdateSegmentEvidenceAction>(
    "UPDATE_SEGMENT_EVIDENCE",
    { ...input },
    undefined,
    UpdateSegmentEvidenceInputSchema,
    "global",
  );

export const removeSegmentEvidence = (input: RemoveSegmentEvidenceInput) =>
  createAction<RemoveSegmentEvidenceAction>(
    "REMOVE_SEGMENT_EVIDENCE",
    { ...input },
    undefined,
    RemoveSegmentEvidenceInputSchema,
    "global",
  );
