---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/utils.ts"
force: true
---
import type { DocumentModelUtils } from "document-model";
import type { <%= phStateName %> } from "./gen/types.js";
import { utils as genUtils } from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

/** Utils for the <%= pascalCaseDocumentType %> document model */
export const utils = { ...genUtils, ...customUtils } satisfies DocumentModelUtils<<%= phStateName %>>;
