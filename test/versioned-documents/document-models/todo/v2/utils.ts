import type { DocumentModelUtils } from "@powerhousedao/shared/document-model";
import type { TodoPHState } from "./gen/types.js";
import { utils as genUtils } from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

/** Utils for the Todo document model */
export const utils: DocumentModelUtils<TodoPHState> = {
  ...genUtils,
  ...customUtils,
};
