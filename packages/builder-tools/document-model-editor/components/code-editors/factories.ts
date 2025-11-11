import { forceLinting } from "@codemirror/lint";
import { Transaction } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { updateTimeout } from "../../constants/documents.js";

export function makeUpdateHandler(
  readonly: boolean | undefined,
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  updateDocumentInModel?: (newDoc: string) => void,
) {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (!!readonly || !update.docChanged) return;
    if (
      update.transactions.some(
        (tr) => tr.annotation(Transaction.userEvent) === "external",
      )
    )
      return;

    const newDoc = update.state.doc.toString();

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      updateDocumentInModel?.(newDoc);
    }, updateTimeout);
  });
}

export function makeFocusHandler(
  readonly: boolean | undefined,
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  updateDocumentInModel?: (newDoc: string) => void,
) {
  return EditorView.focusChangeEffect.of((state, focusing) => {
    if (!!readonly || focusing) return null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    const newDoc = state.doc.toString();
    updateDocumentInModel?.(newDoc);
    return null;
  });
}

export function makePasteHandler(
  readonly: boolean | undefined,
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  updateDocumentInModel?: (newDoc: string) => void,
) {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      if (readonly) return false;
      const newDoc = view.state.doc.toString();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      updateDocumentInModel?.(newDoc);
      forceLinting(view);
      return false;
    },
  });
}
