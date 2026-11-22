/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { baseActions } from "document-model";
import {
  problemSheetAgentFeedbackActions,
  problemSheetConstraintsActions,
  problemSheetContextActions,
  problemSheetCoreJobActions,
  problemSheetJobStepsActions,
  problemSheetOutcomesActions,
  problemSheetRolesActions,
} from "./gen/creators.js";

/** Actions for the ProblemSheet document model */

export const actions = {
  ...baseActions,
  ...problemSheetContextActions,
  ...problemSheetCoreJobActions,
  ...problemSheetJobStepsActions,
  ...problemSheetRolesActions,
  ...problemSheetOutcomesActions,
  ...problemSheetConstraintsActions,
  ...problemSheetAgentFeedbackActions,
};
