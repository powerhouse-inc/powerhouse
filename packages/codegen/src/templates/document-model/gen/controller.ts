import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/file-builders";
import { ts } from "@tmpl/core";

export const documentModelGenControllerFileTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
import { PHDocumentController } from "@powerhousedao/shared/document-model";
import { ${v.pascalCaseDocumentType} } from "../module.js";
import type { ${v.actionTypeName}, ${v.phStateName} } from "./types.js";

export const ${v.pascalCaseDocumentType}Controller = PHDocumentController.forDocumentModel<
  ${v.phStateName},
  ${v.actionTypeName}
>(${v.pascalCaseDocumentType});
`.raw;
