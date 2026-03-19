import type { DocumentModelUtils } from "@powerhousedao/shared/document-model";
import type { SubgraphModulePHState } from "./gen/types.js";
import { utils as genUtils } from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

/** Utils for the SubgraphModule document model */
export const utils: DocumentModelUtils<SubgraphModulePHState> = {
  ...genUtils,
  ...customUtils,
};
