import { json, jsonLanguage, jsonParseLinter } from "@codemirror/lang-json";
import { forceLinting, linter } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useTheme } from "@powerhousedao/reactor-browser";
import { memo, useEffect, useRef } from "react";
import { ayuLight, dracula } from "thememirror";
import { baseEditorExtensions, baseKeymap } from "./constants.js";
import {
  makeFocusHandler,
  makePasteHandler,
  makeUpdateHandler,
} from "./factories.js";
import {
  useDocumentSync,
  useEditorCleanup,
  useEditorRefs,
  useHandlerReconfiguration,
} from "./hooks.js";

type Props = {
  doc: string;
  readonly?: boolean;
  /* Updates the document in the model, should be wrapped in `useCallback` in the parent */
  updateDocumentInModel?: (newDoc: string) => void;
};

const JSONEditor = memo(function JSONEditor(props: Props) {
  const { doc, readonly = false, updateDocumentInModel } = props;
  const {
    editorRef,
    viewRef,
    updateListenerCompartment,
    focusHandlerCompartment,
    pasteHandlerCompartment,
    timeoutRef,
  } = useEditorRefs();
  const { theme } = useTheme();
  const themeCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!viewRef.current) {
      viewRef.current = new EditorView({
        state: EditorState.create({
          doc,
          extensions: [
            ...baseEditorExtensions,
            keymap.of(baseKeymap),
            themeCompartment.current.of(theme === "light" ? ayuLight : dracula),
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

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartment.current.reconfigure(
        theme === "light" ? ayuLight : dracula,
      ),
    });
  }, [theme]);

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

export default JSONEditor;
