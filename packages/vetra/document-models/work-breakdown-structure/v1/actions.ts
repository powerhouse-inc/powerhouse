/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { baseActions } from "document-model";
import {
  workBreakdownStructurePackagesActions,
  workBreakdownStructureTasksActions,
  workBreakdownStructureWbsMetaActions,
  workBreakdownStructureWbsStatusActions,
} from "./gen/creators.js";

/** Actions for the WorkBreakdownStructure document model */

export const actions = {
  ...baseActions,
  ...workBreakdownStructureWbsMetaActions,
  ...workBreakdownStructureWbsStatusActions,
  ...workBreakdownStructurePackagesActions,
  ...workBreakdownStructureTasksActions,
};
