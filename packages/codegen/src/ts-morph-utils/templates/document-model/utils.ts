import type { DocumentModelVariableNames } from "@powerhousedao/codegen/ts-morph";
import { ts } from "@tmpl/core";

export const documentModelUtilsTemplate = ({
  phStateName,
  pascalCaseDocumentType,
}: DocumentModelVariableNames) =>
  ts`
import type { DocumentModelUtils } from "document-model";
import type { ${phStateName} } from "@powerhousedao/codegen/ts-morph";
import { utils as genUtils } from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

/** Utils for the ${pascalCaseDocumentType} document model */
export const utils = { ...genUtils, ...customUtils } satisfies DocumentModelUtils<${phStateName}>;
`.raw;
