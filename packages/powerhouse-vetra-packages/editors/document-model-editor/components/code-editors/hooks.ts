import { forceLinting } from "@codemirror/lint";
import { Compartment, Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import {
  makeFocusHandler,
  makePasteHandler,
  makeUpdateHandler,
} from "./factories.js";

export type EditorConfig = {
  doc: string;
  readonly?: boolean;
  updateDocumentInModel?: (newDoc: string) => void;
};

export function useEditorRefs() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const updateListenerCompartment = useRef(new Compartment());
  const focusHandlerCompartment = useRef(new Compartment());
  const pasteHandlerCompartment = useRef(new Compartment());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return {
    editorRef,
    viewRef,
    updateListenerCompartment,
    focusHandlerCompartment,
    pasteHandlerCompartment,
    timeoutRef,
  };
}

export function useEditorCleanup(
  viewRef: React.MutableRefObject<EditorView | null>,
) {
  useEffect(() => {
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);
}

export function useHandlerReconfiguration(
  view: EditorView | null,
  readonly: boolean | undefined,
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  updateDocumentInModel: ((newDoc: string) => void) | undefined,
  compartments: {
    updateListener: Compartment;
    focusHandler: Compartment;
    pasteHandler: Compartment;
  },
) {
  useEffect(() => {
    if (!view) return;
    view.dispatch({
      effects: [
        compartments.updateListener.reconfigure(
          makeUpdateHandler(readonly, timeoutRef, updateDocumentInModel),
        ),
        compartments.focusHandler.reconfigure(
          makeFocusHandler(readonly, timeoutRef, updateDocumentInModel),
        ),
        compartments.pasteHandler.reconfigure(
          makePasteHandler(readonly, timeoutRef, updateDocumentInModel),
        ),
      ],
    });
    forceLinting(view);
  }, [readonly, updateDocumentInModel]);
}

export function useDocumentSync(view: EditorView | null, doc: string) {
  useEffect(() => {
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== doc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: doc },
        annotations: [Transaction.userEvent.of("external")],
      });
      forceLinting(view);
    }
  }, [doc]);
}
