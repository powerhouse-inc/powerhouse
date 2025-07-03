import { type EditorModule } from "document-model";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import {
  loadableEditorModulesAtom,
  unwrappedEditorModulesAtom,
} from "./atoms.js";
import { type Loadable } from "./types.js";

export function useEditors() {
  const editors = useAtomValue(loadableEditorModulesAtom);
  return editors;
}

export function useEditorById(
  id: string | null | undefined,
): Loadable<EditorModule | undefined> {
  const editors = useEditors();
  if (!id) return { state: "hasData", data: undefined };
  if (editors.state !== "hasData") return editors;
  const editor = editors.data?.find((editor) => editor.config.id === id);
  return { state: "hasData", data: editor };
}

export function useEditorByDocumentType(
  documentType: string | null | undefined,
): Loadable<EditorModule | undefined> {
  const editors = useEditors();
  if (!documentType) return { state: "hasData", data: undefined };
  if (editors.state !== "hasData") return editors;
  const editor = editors.data?.find((editor) =>
    editor.documentTypes.includes(documentType),
  );
  return { state: "hasData", data: editor };
}

export function useGetEditor() {
  const unwrappedEditors = useAtomValue(unwrappedEditorModulesAtom);

  const getEditor = useCallback(
    (documentType: string, preferredEditorId?: string) => {
      if (!unwrappedEditors) return undefined;

      const preferredEditor = unwrappedEditors.find(
        (editor) =>
          editor.config.id === preferredEditorId &&
          editor.documentTypes.includes(documentType),
      );

      if (preferredEditor) return preferredEditor;

      const defaultEditor = unwrappedEditors.find((editor) =>
        editor.documentTypes.includes(documentType),
      );

      return defaultEditor;
    },
    [unwrappedEditors],
  );

  return getEditor;
}
