import { baseActions } from "document-model";
import { testDocBaseOperationsActions } from "./gen/creators.js";

/** Actions for the TestDoc document model */

export const actions = { ...baseActions, ...testDocBaseOperationsActions };
