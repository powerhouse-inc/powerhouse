/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { WorkBreakdownStructurePackagesAction } from "./packages/actions.js";
import type { WorkBreakdownStructureTasksAction } from "./tasks/actions.js";
import type { WorkBreakdownStructureWbsMetaAction } from "./wbs-meta/actions.js";
import type { WorkBreakdownStructureWbsStatusAction } from "./wbs-status/actions.js";

export * from "./packages/actions.js";
export * from "./tasks/actions.js";
export * from "./wbs-meta/actions.js";
export * from "./wbs-status/actions.js";

export type WorkBreakdownStructureAction =
  | WorkBreakdownStructureWbsMetaAction
  | WorkBreakdownStructureWbsStatusAction
  | WorkBreakdownStructurePackagesAction
  | WorkBreakdownStructureTasksAction;
