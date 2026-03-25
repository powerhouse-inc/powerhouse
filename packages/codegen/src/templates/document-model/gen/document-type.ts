import { ts } from "@tmpl/core";
import type { DocumentModelTemplateInputs } from "file-builders";

export const documentModelDocumentTypeTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
export const ${v.documentTypeVariableName} = "${v.documentTypeId}";
`.raw;
