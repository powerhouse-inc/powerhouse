import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/ts-morph";
import { ts } from "@tmpl/core";

export const documentModelHooksFileTemplate = (
  v: DocumentModelTemplateInputs,
) =>
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
} from "${v.versionedDocumentModelPackageImportPath}";
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
