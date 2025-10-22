import { useDocumentById } from "@powerhousedao/reactor-browser";
import { redo, undo } from "document-model/core";

export function useDocumentUndoRedo(documentId?: string) {
  const [document, dispatch] = useDocumentById(documentId);

  const globalRevisionNumber = document?.header.revision.global ?? 0;
  const localRevisionNumber = document?.header.revision.local ?? 0;
  const canUndo = globalRevisionNumber > 0 || localRevisionNumber > 0;
  const canRedo = !!document?.clipboard.length;

  const handleUndo = () => {
    dispatch(undo());
  };
  const handleRedo = () => {
    dispatch(redo());
  };

  return {
    undo: handleUndo,
    redo: handleRedo,
    canUndo,
    canRedo,
  };
}
