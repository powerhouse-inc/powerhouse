/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  ArchiveFeatureInput,
  ClearPromotionInput,
  CommitFeatureInput,
  ParkFeatureInput,
  PromoteToSpecInput,
  ReopenFeatureInput,
  StartEvaluationInput,
} from "../types.js";

export type StartEvaluationAction = Action & {
  type: "START_EVALUATION";
  input: StartEvaluationInput;
};
export type CommitFeatureAction = Action & {
  type: "COMMIT_FEATURE";
  input: CommitFeatureInput;
};
export type PromoteToSpecAction = Action & {
  type: "PROMOTE_TO_SPEC";
  input: PromoteToSpecInput;
};
export type ArchiveFeatureAction = Action & {
  type: "ARCHIVE_FEATURE";
  input: ArchiveFeatureInput;
};
export type ParkFeatureAction = Action & {
  type: "PARK_FEATURE";
  input: ParkFeatureInput;
};
export type ReopenFeatureAction = Action & {
  type: "REOPEN_FEATURE";
  input: ReopenFeatureInput;
};
export type ClearPromotionAction = Action & {
  type: "CLEAR_PROMOTION";
  input: ClearPromotionInput;
};

export type FeatureLifecycleAction =
  | StartEvaluationAction
  | CommitFeatureAction
  | PromoteToSpecAction
  | ArchiveFeatureAction
  | ParkFeatureAction
  | ReopenFeatureAction
  | ClearPromotionAction;
