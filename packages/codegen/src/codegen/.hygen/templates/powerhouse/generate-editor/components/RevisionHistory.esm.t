---
to: "<%= documentType ? `${rootDir}/${h.changeCase.param(name)}/components/RevisionHistory.tsx` : null %>"
unless_exists: true
---
<% if (documentType) { %>
import { RevisionHistory as RevisionHistoryComponent } from "@powerhousedao/design-system";
import type { <%= documentType.name %>Document } from "<%= documentType.importPath.startsWith('.') ? '../' + documentType.importPath : documentType.importPath %>";

/**
 * Props for the RevisionHistory component
 *
 * @property document - The document to display revision history for
 * @property onClose - Callback when closing the revision history view
 */
type RevisionHistoryProps = {
  document: <%= documentType.name %>Document;
  onClose: () => void;
};

export function RevisionHistory({ document, onClose }: RevisionHistoryProps) {
  // Extract operations from document
  const globalOperations = document.operations.global;
  const localOperations = document.operations.local;

  // Get document metadata
  const documentTitle = document.header.name || "Untitled Document";
  const documentId = document.header.id;

  // Handle copy state action
  const handleCopyState = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(document.state, null, 2));
      alert("Document state copied to clipboard");
    } catch (error) {
      console.error("Failed to copy state to clipboard:", error);
      alert("Failed to copy state to clipboard");
    }
  };

  return (
    <RevisionHistoryComponent
      documentTitle={documentTitle}
      documentId={documentId}
      globalOperations={globalOperations}
      localOperations={localOperations}
      onClose={onClose}
      documentState={document.state}
      onCopyState={handleCopyState}
    />
  );
}
<% } %>
