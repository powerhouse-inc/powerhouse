import { baseActions, type Actions } from "document-model";
import { baseOperationsActions, dndOperationsActions } from "./gen/creators.js";

/** Actions for the AppModule document model */

export const actions: Actions = {
  ...baseActions,
  ...baseOperationsActions,
  ...dndOperationsActions,
};
