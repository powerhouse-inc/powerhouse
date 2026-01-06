import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/ts-morph";
import { ts } from "@tmpl/core";

export const documentModelDocumentTypeTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
export const ${v.documentTypeVariableName} = "${v.documentTypeId}";
`.raw;
