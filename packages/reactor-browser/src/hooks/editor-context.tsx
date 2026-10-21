import type {
  DocumentDispatch,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

/** The document an editor is rendered with, and a dispatch bound to it. */
export type EditorDocumentContextValue = readonly [
  PHDocument,
  DocumentDispatch,
];

const EditorDocumentContext = createContext<
  EditorDocumentContextValue | undefined
>(undefined);

/** Hosts render an editor inside this, with the same `document` and `dispatch`
 * as its props; `useSelected*Document` hooks below read them. */
export function EditorDocumentProvider(props: {
  document: PHDocument;
  dispatch: DocumentDispatch;
  children: ReactNode;
}) {
  const { document, dispatch } = props;
  const value = useMemo(
    () => [document, dispatch] as const,
    [document, dispatch],
  );
  return (
    <EditorDocumentContext.Provider value={value}>
      {props.children}
    </EditorDocumentContext.Provider>
  );
}

/** The nearest editor's document and dispatch, or undefined outside one. */
export function useEditorDocumentContext() {
  return useContext(EditorDocumentContext);
}
