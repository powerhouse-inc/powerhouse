import { EditorState, Transaction } from "@codemirror/state";
import { memo, useEffect, useRef } from "react";
import { ayuLight } from "thememirror";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { linter, lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  ViewUpdate,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { json, jsonLanguage, jsonParseLinter } from "@codemirror/lang-json";

type Props = {
  doc: string;
  readonly?: boolean;
  /* Updates the editor when the document changes */
  updateDoc: (newDoc: string) => void;
};

export const JSONEditor = memo(function JSONEditor(props: Props) {
  const { doc, readonly = false, updateDoc } = props;
  const parentRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!viewRef.current) {
      const state = EditorState.create({
        doc,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            ...lintKeymap,
          ]),
          ayuLight,
          jsonLanguage,
          json(),
          linter(jsonParseLinter()),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": { fontSize: "18px" },
          }),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (readonly || !update.docChanged) return;

            // ignore updates from the outside
            if (
              update.transactions.some(
                (tr) => tr.annotation(Transaction.userEvent) === "external",
              )
            )
              return;

            const newDoc = update.state.doc.toString();

            try {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
              }
              timeoutRef.current = setTimeout(() => {
                updateDoc(newDoc);
              }, 500);
            } catch (error) {
              console.debug("in json editor update", error);
            }
          }),
          EditorState.readOnly.of(readonly),
          keymap.of([indentWithTab]),
        ],
      });

      viewRef.current = new EditorView({
        state,
        parent: parentRef.current!,
      });
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  /* Updates the editor when the document changes */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc !== doc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: doc },
        annotations: [Transaction.userEvent.of("external")],
      });
    }
  }, [doc]);

  return <div ref={parentRef} />;
});
