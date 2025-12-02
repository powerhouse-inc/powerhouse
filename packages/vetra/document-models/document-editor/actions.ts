import { baseActions } from "document-model";
import { baseOperationsActions } from "./gen/creators.js";

/** Actions for the DocumentEditor document model */

export const actions = { ...baseActions, ...baseOperationsActions };
