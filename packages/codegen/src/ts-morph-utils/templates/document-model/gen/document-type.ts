import { ts } from "@tmpl/core";
import type { DocumentModelVariableNames } from "../../../name-builders/types.js";

export const documentModelDocumentTypeTemplate = ({
  documentTypeVariableName,
  documentTypeId,
}: DocumentModelVariableNames) =>
  ts`
export const ${documentTypeVariableName} = "${documentTypeId}";
`.raw;
