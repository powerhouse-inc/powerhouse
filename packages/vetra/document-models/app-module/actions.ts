import { baseActions } from "document-model";
import { baseOperationsActions, dndOperationsActions } from "./gen/creators.js";

/** Actions for the AppModule document model */
export const actions = {
  ...baseActions,
  ...baseOperationsActions,
  ...dndOperationsActions,
};
