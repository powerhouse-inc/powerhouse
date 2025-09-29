---
to: "<%= documentType ? `${rootDir}/hooks/use${h.changeCase.pascal(documentType.name)}Document.ts` : null %>"
unless_exists: true
---
<% if (documentType) { %>
import { useDocumentOfType, useSelectedDocumentId } from "@powerhousedao/reactor-browser";
import type { <%= documentType.name %>Action, <%= documentType.name %>Document } from "<%= documentType.importPath %>";

export function use<%= documentType.name %>Document(documentId: string | null | undefined) {
  return useDocumentOfType<<%= documentType.name %>Document, <%= documentType.name %>Action>(documentId, "<%= documentType.type %>");
}

export function useSelected<%= documentType.name %>Document() {
  const selectedDocumentId = useSelectedDocumentId();
  return use<%= documentType.name %>Document(selectedDocumentId);
}
<% } %>