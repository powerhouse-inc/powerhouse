import { useDocumentById } from "@powerhousedao/reactor-browser";
import {
  redo,
  undo,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  defaultTo,
  filter,
  hasAtLeast,
  isTruthy,
  merge,
  pipe,
  prop,
  values,
} from "remeda";

/**
 * Checks whether a document has at least one non-zero revision count.
 *
 * Revision scopes are dynamic document-model keys, so this checks the values of
 * the document's revision object instead of relying on a fixed list of scope
 * names.
 */
function hasRevisions(document: PHDocument | undefined) {
  return pipe(
    prop(document, "header", "revision"),
    defaultTo({}),
    values(),
    filter(isTruthy),
    hasAtLeast(1),
  );
}

/**
 * Returns undo state and an undo dispatcher for a document.
 *
 * `canUndo` is true when the document has at least one non-zero revision count
 * across any revision scope.
 */
export function useUndo(documentId: string | undefined) {
  const [document, dispatch] = useDocumentById(documentId);
  const canUndo = hasRevisions(document);

  return {
    canUndo,
    undo: () => dispatch(undo()),
  };
}

/**
 * Returns redo state and a redo dispatcher for a document.
 *
 * `canRedo` is true when the document clipboard contains at least one operation
 * that can be reapplied.
 */
export function useRedo(documentId: string | undefined) {
  const [document, dispatch] = useDocumentById(documentId);
  const canRedo = hasAtLeast(document?.clipboard ?? [], 1);

  return {
    canRedo,
    redo: () => dispatch(redo()),
  };
}

/**
 * Returns combined undo and redo state for a document.
 */
export function useDocumentUndoRedo(documentId?: string) {
  const undoProps = useUndo(documentId);
  const redoProps = useRedo(documentId);
  return merge(undoProps, redoProps);
}
