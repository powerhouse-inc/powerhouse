import { baseActions } from "document-model";
import { todoOperationsActions } from "./gen/creators.js";

/** Actions for the Todo document model */

export const actions = { ...baseActions, ...todoOperationsActions };
