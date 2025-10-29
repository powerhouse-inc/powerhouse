---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/utils.ts"
force: true
---
import { utils as genUtils } from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

/** Utils for the <%= pascalCaseDocumentType %> document model */
export const utils = { ...genUtils, ...customUtils };
