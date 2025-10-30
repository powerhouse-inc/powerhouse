---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/hooks.ts"
force: true
---

import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useDocumentById,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  <%= phDocumentTypeName %>,
  <%= actionTypeName %>,
} from "<%= documentModelDir %>";
import { <%= isPhDocumentOfTypeFunctionName %> } from "<%= documentModelDir %>";

/** Hook to get a <%= pascalCaseDocumentType %> document by its id */
export function <%= useByIdHookName %>(
  documentId: string | null | undefined,
):
  | [<%= phDocumentTypeName %>, DocumentDispatch<<%= actionTypeName %>>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!<%= isPhDocumentOfTypeFunctionName %>(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected <%= pascalCaseDocumentType %> document */
export function <%= useSelectedHookName %>():
  | [<%= phDocumentTypeName %>, DocumentDispatch<<%= actionTypeName %>>]
  | [undefined, undefined] {
  const [document, dispatch] = useSelectedDocument();
  if (!<%= isPhDocumentOfTypeFunctionName %>(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get all <%= pascalCaseDocumentType %> documents in the selected drive */
export function <%= useInSelectedDriveHookName %>() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(<%= isPhDocumentOfTypeFunctionName %>);
}

/** Hook to get all <%= pascalCaseDocumentType %> documents in the selected folder */
export function <%= useInSelectedFolderHookName %>() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(<%= isPhDocumentOfTypeFunctionName %>);
}
