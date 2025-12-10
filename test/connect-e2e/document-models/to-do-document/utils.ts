import type { DocumentModelUtils } from "document-model";
import type { ToDoDocumentPHState } from "./gen/types.js";
import { utils as genUtils } from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

/** Utils for the ToDoDocument document model */
export const utils = {
  ...genUtils,
  ...customUtils,
} satisfies DocumentModelUtils<ToDoDocumentPHState>;
