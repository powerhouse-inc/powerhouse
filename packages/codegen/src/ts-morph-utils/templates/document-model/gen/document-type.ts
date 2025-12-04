import { ts } from "@tmpl/core";
import type { DocumentModelTemplateInputs } from "../../../name-builders/types.js";

export const documentModelDocumentTypeTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
export const ${v.documentTypeVariableName} = "${v.documentTypeId}";
`.raw;
