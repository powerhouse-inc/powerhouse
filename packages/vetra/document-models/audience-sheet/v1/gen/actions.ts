/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { AudienceSheetAgentFeedbackAction } from "./agent-feedback/actions.js";
import type { AudienceSheetSegmentsAction } from "./segments/actions.js";

export * from "./agent-feedback/actions.js";
export * from "./segments/actions.js";

export type AudienceSheetAction =
  | AudienceSheetSegmentsAction
  | AudienceSheetAgentFeedbackAction;
