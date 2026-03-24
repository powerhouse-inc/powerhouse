import {
    baseActions,
    type Actions,
} from "document-model";
import { todoOperationsActions } from "./gen/creators.js";

/** Actions for the Todo document model */

export const actions: Actions = { ...baseActions, ...todoOperationsActions };
