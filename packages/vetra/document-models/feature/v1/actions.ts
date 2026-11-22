/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { baseActions } from "document-model";
import {
  featureAgentFeedbackActions,
  featureDefinitionActions,
  featureEvidenceActions,
  featureLifecycleActions,
  featureReferencesActions,
  featureSegmentRefsActions,
  featureTargetsActions,
} from "./gen/creators.js";

/** Actions for the Feature document model */

export const actions = {
  ...baseActions,
  ...featureDefinitionActions,
  ...featureTargetsActions,
  ...featureSegmentRefsActions,
  ...featureReferencesActions,
  ...featureLifecycleActions,
  ...featureEvidenceActions,
  ...featureAgentFeedbackActions,
};
