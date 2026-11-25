/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { ProblemSheetAgentFeedbackAction } from "./agent-feedback/actions.js";
import type { ProblemSheetConstraintsAction } from "./constraints/actions.js";
import type { ProblemSheetContextAction } from "./context/actions.js";
import type { ProblemSheetCoreJobAction } from "./core-job/actions.js";
import type { ProblemSheetJobStepsAction } from "./job-steps/actions.js";
import type { ProblemSheetOutcomesAction } from "./outcomes/actions.js";
import type { ProblemSheetRolesAction } from "./roles/actions.js";

export * from "./agent-feedback/actions.js";
export * from "./constraints/actions.js";
export * from "./context/actions.js";
export * from "./core-job/actions.js";
export * from "./job-steps/actions.js";
export * from "./outcomes/actions.js";
export * from "./roles/actions.js";

export type ProblemSheetAction =
  | ProblemSheetContextAction
  | ProblemSheetCoreJobAction
  | ProblemSheetJobStepsAction
  | ProblemSheetRolesAction
  | ProblemSheetOutcomesAction
  | ProblemSheetConstraintsAction
  | ProblemSheetAgentFeedbackAction;
