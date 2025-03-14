import { linter, forceLinting } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { memo, useEffect } from "react";
import { ayuLight } from "thememirror";
import { json, jsonLanguage, jsonParseLinter } from "@codemirror/lang-json";
import {
  useEditorRefs,
  baseEditorExtensions,
  baseKeymap,
  makeUpdateHandler,
  makeFocusHandler,
  makePasteHandler,
  useEditorCleanup,
  useHandlerReconfiguration,
  useDocumentSync,
} from "./utils.js";

type Props = {
  doc: string;
  readonly?: boolean;
  /* Updates the document in the model, should be wrapped in `useCallback` in the parent */
  updateDocumentInModel?: (newDoc: string) => void;
};

export const JSONEditor = memo(function JSONEditor(props: Props) {
  const { doc, readonly = false, updateDocumentInModel } = props;
  const {
    editorRef,
    viewRef,
    updateListenerCompartment,
    focusHandlerCompartment,
    pasteHandlerCompartment,
    timeoutRef,
  } = useEditorRefs();

  useEffect(() => {
    if (!viewRef.current) {
      viewRef.current = new EditorView({
        state: EditorState.create({
          doc,
          extensions: [
            ...baseEditorExtensions,
            keymap.of(baseKeymap),
            ayuLight,
            jsonLanguage,
            json(),
            linter(jsonParseLinter()),
            updateListenerCompartment.current.of(
              makeUpdateHandler(readonly, timeoutRef, updateDocumentInModel),
            ),
            focusHandlerCompartment.current.of(
              makeFocusHandler(readonly, timeoutRef, updateDocumentInModel),
            ),
            pasteHandlerCompartment.current.of(
              makePasteHandler(readonly, timeoutRef, updateDocumentInModel),
            ),
            EditorState.readOnly.of(readonly),
          ],
        }),
        parent: editorRef.current!,
      });
      forceLinting(viewRef.current);
    }
  }, []);

  useEditorCleanup(viewRef);

  useHandlerReconfiguration(
    viewRef.current,
    readonly,
    timeoutRef,
    updateDocumentInModel,
    {
      updateListener: updateListenerCompartment.current,
      focusHandler: focusHandlerCompartment.current,
      pasteHandler: pasteHandlerCompartment.current,
    },
  );

  useDocumentSync(viewRef.current, doc);

  return <div ref={editorRef} />;
});
