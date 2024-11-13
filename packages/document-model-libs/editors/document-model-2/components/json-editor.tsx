import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { ayuLight } from "thememirror";

type Props = {
  doc: string;
  readonly?: boolean;
  updateDoc: (newDoc: string) => void;
};

export function JSONEditor(props: Props) {
  const { doc, readonly, updateDoc } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc,
      extensions: [
        basicSetup,
        ayuLight,
        json(),
        linter(jsonParseLinter()),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { fontSize: "18px" },
        }),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (readonly || !update.docChanged) return;

          if (
            update.transactions.some(
              (tr) => tr.annotation(Transaction.userEvent) === "external",
            )
          )
            return;

          const newDoc = update.state.doc.toString();

          try {
            JSON.parse(newDoc);
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
              updateDoc(newDoc);
            }, 300);
          } catch (e) {
            /* do nothing */
          }
        }),
        EditorState.readOnly.of(!!readonly),
      ],
    });

    let view = viewRef.current;
    if (!view) {
      view = new EditorView({
        state,
        parent: editorRef.current,
      });
      viewRef.current = view;
    } else {
      view.setState(state);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [readonly]);

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

  return <div ref={editorRef} />;
}
