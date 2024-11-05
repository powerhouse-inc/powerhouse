import { Annotation, EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { GraphQLSchema } from "graphql";
import { ayuLight } from "thememirror";

const jsonLinter = jsonParseLinter();
const skipUpdateAnnotation = Annotation.define<boolean>();
type Props = {
  schema: GraphQLSchema;
  doc: string;
  readonly?: boolean;
  updateDoc: (newDoc: string) => void;
};

export function JSONEditor(props: Props) {
  const { doc, readonly, updateDoc } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const stateRef = useRef<EditorState | null>(null);

  useEffect(() => {
    stateRef.current = EditorState.create({
      doc: doc || "{}",
      extensions: [
        basicSetup,
        ayuLight,
        json(),
        linter(jsonLinter),
        EditorView.lineWrapping,
        EditorView.theme({
          "&": {
            fontSize: "18px",
          },
        }),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (readonly) return;
          if (
            update.transactions.some((tr) =>
              tr.annotation(skipUpdateAnnotation),
            )
          ) {
            return;
          }
          if (update.docChanged) {
            const newDoc = update.state.doc.toString();
            const isValid = jsonLinter(update.view).length === 0;
            if (!!newDoc && isValid && newDoc !== doc) {
              updateDoc(newDoc);
            }
          }
        }),
        EditorView.focusChangeEffect.of((state, focusing) => {
          if (readonly || focusing) return null;
          const newDoc = state.doc.toString();
          if (!!newDoc && newDoc !== doc) {
            updateDoc(newDoc);
          }
          return null;
        }),
        EditorState.readOnly.of(!!readonly),
      ],
    });

    const view = new EditorView({
      state: stateRef.current,
      parent: editorRef.current!,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []);

  useEffect(() => {
    if (!doc) return;

    const view = viewRef.current!;
    const currentDoc = view.state.doc;
    const currentDocString = currentDoc.toString();
    if (currentDocString !== doc) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: doc,
        },
        annotations: skipUpdateAnnotation.of(true), // Add this line
      });
    }
  }, [doc]);

  return <div ref={editorRef} />;
}
