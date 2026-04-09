import { ts } from "@tmpl/core";
import type { DocumentModelTemplateInputs } from "file-builders";

export const documentModelDocumentTypeTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
export const ${v.documentTypeVariableName} = "${v.documentTypeId}";
`.raw;
