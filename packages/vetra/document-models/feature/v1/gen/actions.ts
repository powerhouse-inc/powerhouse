/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { FeatureAgentFeedbackAction } from "./agent-feedback/actions.js";
import type { FeatureDefinitionAction } from "./definition/actions.js";
import type { FeatureEvidenceAction } from "./evidence/actions.js";
import type { FeatureLifecycleAction } from "./lifecycle/actions.js";
import type { FeatureReferencesAction } from "./references/actions.js";
import type { FeatureSegmentRefsAction } from "./segment-refs/actions.js";
import type { FeatureTargetsAction } from "./targets/actions.js";

export * from "./agent-feedback/actions.js";
export * from "./definition/actions.js";
export * from "./evidence/actions.js";
export * from "./lifecycle/actions.js";
export * from "./references/actions.js";
export * from "./segment-refs/actions.js";
export * from "./targets/actions.js";

export type FeatureAction =
  | FeatureDefinitionAction
  | FeatureTargetsAction
  | FeatureSegmentRefsAction
  | FeatureReferencesAction
  | FeatureLifecycleAction
  | FeatureEvidenceAction
  | FeatureAgentFeedbackAction;
