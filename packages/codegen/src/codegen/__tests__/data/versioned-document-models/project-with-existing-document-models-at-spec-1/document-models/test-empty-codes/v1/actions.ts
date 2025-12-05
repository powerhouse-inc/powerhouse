import { baseActions } from "document-model";
import { testOperationsActions } from "./gen/creators.js";

/** Actions for the TestEmptyCodes document model */

export const actions = { ...baseActions, ...testOperationsActions };
