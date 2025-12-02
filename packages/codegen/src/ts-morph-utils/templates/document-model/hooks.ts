import { ts } from "@tmpl/core";
import type { DocumentModelVariableNames } from "../../name-builders/types.js";

export const documentModelHooksFileTemplate = (v: DocumentModelVariableNames) =>
  ts`

import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  ${v.phDocumentTypeName},
  ${v.actionTypeName},
} from "${v.documentModelDir}";
import { ${v.isPhDocumentOfTypeFunctionName} } from "./gen/document-schema.js";

/** Hook to get a ${v.pascalCaseDocumentType} document by its id */
export function ${v.useByIdHookName}(
  documentId: string | null | undefined,
):
  | [${v.phDocumentTypeName}, DocumentDispatch<${v.actionTypeName}>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!${v.isPhDocumentOfTypeFunctionName}(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected ${v.pascalCaseDocumentType} document */
export function ${v.useSelectedHookName}():
  | [${v.phDocumentTypeName}, DocumentDispatch<${v.actionTypeName}>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!${v.isPhDocumentOfTypeFunctionName}(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all ${v.pascalCaseDocumentType} documents in the selected drive */
export function ${v.useInSelectedDriveHookName}() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(${v.isPhDocumentOfTypeFunctionName});
}

/** Hook to get all ${v.pascalCaseDocumentType} documents in the selected folder */
export function ${v.useInSelectedFolderHookName}() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(${v.isPhDocumentOfTypeFunctionName});
}
`.raw;
