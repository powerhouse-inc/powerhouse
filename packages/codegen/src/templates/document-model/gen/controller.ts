import { ts } from "@tmpl/core";
import type { DocumentModelFileMakerArgs } from "file-builders";

export const documentModelGenControllerFileTemplate = (
  v: DocumentModelFileMakerArgs,
) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { ${v.pascalCaseDocumentType} } from "../module.js";
import type { ${v.actionTypeName}, ${v.phStateName} } from "./types.js";

export const ${v.pascalCaseDocumentType}Controller = PHDocumentController.forDocumentModel<
  ${v.phStateName},
  ${v.actionTypeName}
>(${v.pascalCaseDocumentType});
`.raw;
