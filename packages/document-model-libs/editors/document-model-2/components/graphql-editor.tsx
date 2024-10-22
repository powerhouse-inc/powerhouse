import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { ViewUpdate } from "@codemirror/view";
import { useStore } from "@tanstack/react-store";
import { EditorView, basicSetup } from "codemirror";
import { GraphQLSchema } from "graphql";
import { useRef, useEffect } from "react";
import { standardLibraryLinter } from "../lib/linter";
import { docStore, updateDoc } from "../store/docStore";
import { graphql, updateSchema } from "cm6-graphql";
type Props = {
  id: string;
  schema: GraphQLSchema;
  initialDoc?: string;
  readonly?: boolean;
};

export function GraphqlEditor(props: Props) {
  const { schema, id, initialDoc, readonly } = props;
  const doc = useStore(docStore, (state) => state.get(id));
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const stateRef = useRef<EditorState | null>(null);
  useEffect(() => {
    stateRef.current = EditorState.create({
      doc: initialDoc ?? doc,
      extensions: [
        basicSetup,
        oneDark,
        graphql(schema),
        standardLibraryLinter,
        EditorView.lineWrapping,
        EditorView.theme({
          "&": {
            fontSize: "18px",
          },
        }),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (readonly) return;
          if (update.docChanged) {
            const newDoc = update.state.doc.toString();
            updateDoc(id, newDoc);
          }
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
    updateSchema(viewRef.current!, schema);
  }, [schema]);

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
      });
    }
  }, [doc]);

  return <div ref={editorRef} className="my-2" />;
}
