/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { FeatureGlobalState } from "../types.js";
import type {
  ArchiveFeatureAction,
  ClearPromotionAction,
  CommitFeatureAction,
  ParkFeatureAction,
  PromoteToSpecAction,
  ReopenFeatureAction,
  StartEvaluationAction,
} from "./actions.js";

export interface FeatureLifecycleOperations {
  startEvaluationOperation: (
    state: FeatureGlobalState,
    action: StartEvaluationAction,
    dispatch?: SignalDispatch,
  ) => void;
  commitFeatureOperation: (
    state: FeatureGlobalState,
    action: CommitFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
  promoteToSpecOperation: (
    state: FeatureGlobalState,
    action: PromoteToSpecAction,
    dispatch?: SignalDispatch,
  ) => void;
  archiveFeatureOperation: (
    state: FeatureGlobalState,
    action: ArchiveFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
  parkFeatureOperation: (
    state: FeatureGlobalState,
    action: ParkFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
  reopenFeatureOperation: (
    state: FeatureGlobalState,
    action: ReopenFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearPromotionOperation: (
    state: FeatureGlobalState,
    action: ClearPromotionAction,
    dispatch?: SignalDispatch,
  ) => void;
}
