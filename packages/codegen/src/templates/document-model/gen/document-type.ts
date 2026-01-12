import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/file-builders";
import { ts } from "@tmpl/core";

export const documentModelDocumentTypeTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
export const ${v.documentTypeVariableName} = "${v.documentTypeId}";
`.raw;
