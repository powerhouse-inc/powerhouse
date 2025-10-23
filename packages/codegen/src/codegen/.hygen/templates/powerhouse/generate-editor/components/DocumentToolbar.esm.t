---
to: "<%= documentType ? `${rootDir}/${h.changeCase.param(name)}/components/DocumentToolbar.tsx` : null %>"
unless_exists: true
---
<% if (documentType) { %>
import {
  exportDocument,
  setSelectedNode,
  useNodeParentFolderById,
  type DocumentDispatch,
} from "@powerhousedao/reactor-browser";
import { redo, undo } from "document-model/core";
import type { <%= documentType.name %>Action, <%= documentType.name %>Document } from "<%= documentType.importPath.startsWith('.') ? '../' + documentType.importPath : documentType.importPath %>";

/**
 * Props for the DocumentToolbar component
 *
 * @property document - The document being edited
 * @property dispatch - Dispatch function for document operations
 * @property onHistoryClick - Callback when history button is clicked
 */
type DocumentToolbarProps = {
  document: <%= documentType.name %>Document;
  dispatch: DocumentDispatch<<%= documentType.name %>Action>;
  onHistoryClick?: () => void;
};

export function DocumentToolbar({
  document,
  dispatch,
  onHistoryClick,
}: DocumentToolbarProps) {
  // Get the parent folder to navigate back to when closing
  const parentFolder = useNodeParentFolderById(document.header.id);

  // Handle close button click - navigate back to parent folder
  const handleClose = () => {
    setSelectedNode(parentFolder);
  };

  // Handle export button click - export the document
  const handleExport = async () => {
    await exportDocument(document);
  };

  // Handle undo button click - undo the last operation
  const handleUndo = () => {
    // Check if undo is available based on document revision numbers
    const globalRevisionNumber = document.header.revision.global;
    const localRevisionNumber = document.header.revision.local;
    const canUndo = globalRevisionNumber > 0 || localRevisionNumber > 0;

    if (canUndo) {
      dispatch(undo());
    }
  };

  // Handle redo button click - redo the last undone operation
  const handleRedo = () => {
    // Check if redo is available based on document clipboard
    const canRedo = !!document.clipboard.length;

    if (canRedo) {
      dispatch(redo());
    }
  };

  // Get document name or show a fallback
  const documentName = document.header.name || "Untitled Document";

  // Disable export button if there's no document
  const isExportDisabled = !document;

  return (
    <div className="document-toolbar">
      {/* Left section with Undo, Redo, and Export Buttons */}
      <div className="actions-left">
        <button
          onClick={handleUndo}
          className="undo-button"
          aria-label="Undo last action"
        >
          ⟲
        </button>
        <button
          onClick={handleRedo}
          className="redo-button"
          aria-label="Redo last action"
        >
          ⟳
        </button>
        <button
          onClick={() => void handleExport()}
          className="export-button"
          disabled={isExportDisabled}
          aria-label="Export document"
        >
          Export
        </button>
      </div>

      {/* Document Title - Centered */}
      <div className="title">{documentName}</div>

      {/* Right section with History and Close Buttons */}
      <div className="actions-right">
        {onHistoryClick && (
          <button
            onClick={onHistoryClick}
            className="history-button"
            aria-label="View revision history"
          >
            🕐
          </button>
        )}
        <button
          onClick={handleClose}
          className="close-button"
          aria-label="Close document"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
<% } %>
