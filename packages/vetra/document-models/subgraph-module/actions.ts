import { baseActions, type Actions } from "@powerhousedao/shared/document-model";
import { baseOperationsActions } from "./gen/creators.js";

/** Actions for the SubgraphModule document model */

export const actions: Actions = { ...baseActions, ...baseOperationsActions };
