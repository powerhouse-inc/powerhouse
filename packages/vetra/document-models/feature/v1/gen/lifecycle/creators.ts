/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ArchiveFeatureInputSchema,
  ClearPromotionInputSchema,
  CommitFeatureInputSchema,
  ParkFeatureInputSchema,
  PromoteToSpecInputSchema,
  ReopenFeatureInputSchema,
  StartEvaluationInputSchema,
} from "../schema/zod.js";
import type {
  ArchiveFeatureInput,
  ClearPromotionInput,
  CommitFeatureInput,
  ParkFeatureInput,
  PromoteToSpecInput,
  ReopenFeatureInput,
  StartEvaluationInput,
} from "../types.js";
import type {
  ArchiveFeatureAction,
  ClearPromotionAction,
  CommitFeatureAction,
  ParkFeatureAction,
  PromoteToSpecAction,
  ReopenFeatureAction,
  StartEvaluationAction,
} from "./actions.js";

export const startEvaluation = (input: StartEvaluationInput) =>
  createAction<StartEvaluationAction>(
    "START_EVALUATION",
    { ...input },
    undefined,
    StartEvaluationInputSchema,
    "global",
  );

export const commitFeature = (input: CommitFeatureInput) =>
  createAction<CommitFeatureAction>(
    "COMMIT_FEATURE",
    { ...input },
    undefined,
    CommitFeatureInputSchema,
    "global",
  );

export const promoteToSpec = (input: PromoteToSpecInput) =>
  createAction<PromoteToSpecAction>(
    "PROMOTE_TO_SPEC",
    { ...input },
    undefined,
    PromoteToSpecInputSchema,
    "global",
  );

export const archiveFeature = (input: ArchiveFeatureInput) =>
  createAction<ArchiveFeatureAction>(
    "ARCHIVE_FEATURE",
    { ...input },
    undefined,
    ArchiveFeatureInputSchema,
    "global",
  );

export const parkFeature = (input: ParkFeatureInput) =>
  createAction<ParkFeatureAction>(
    "PARK_FEATURE",
    { ...input },
    undefined,
    ParkFeatureInputSchema,
    "global",
  );

export const reopenFeature = (input: ReopenFeatureInput) =>
  createAction<ReopenFeatureAction>(
    "REOPEN_FEATURE",
    { ...input },
    undefined,
    ReopenFeatureInputSchema,
    "global",
  );

export const clearPromotion = (input: ClearPromotionInput) =>
  createAction<ClearPromotionAction>(
    "CLEAR_PROMOTION",
    { ...input },
    undefined,
    ClearPromotionInputSchema,
    "global",
  );
