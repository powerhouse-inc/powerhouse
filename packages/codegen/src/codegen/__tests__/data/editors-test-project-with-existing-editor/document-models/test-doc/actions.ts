import { baseActions } from "@powerhousedao/shared/document-model";
import { baseOperationsActions } from "./gen/creators.js";

/** Actions for the TestDoc document model */

export const actions = { ...baseActions, ...baseOperationsActions };
