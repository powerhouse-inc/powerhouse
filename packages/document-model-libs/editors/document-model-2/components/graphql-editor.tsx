import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { graphql, updateSchema } from "cm6-graphql";
import { useEffect, useRef } from "react";
import { GraphQLSchema, parse } from "graphql";
import { basicSetup } from "codemirror";
import {
  validateGraphQlDocuments,
  createDefaultRules,
  isDocumentString,
} from "@graphql-tools/utils";

const rules = createDefaultRules().filter(
  (rule) => rule.name !== "ExecutableDefinitionsRule",
);
type Props = {
  schema: GraphQLSchema;
  doc?: string;
  readonly?: boolean;
  updateDoc: (newDoc: string) => void;
};

export function GraphqlEditor(props: Props) {
  const { doc, schema, readonly, updateDoc } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const stateRef = useRef<EditorState | null>(null);

  useEffect(() => {
    stateRef.current = EditorState.create({
      doc: doc ?? "",
      extensions: [
        basicSetup,
        oneDark,
        graphql(schema, {
          showErrorOnInvalidSchema: true,
        }),
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
            if (!isDocumentString(newDoc)) return;
            const errors = validateGraphQlDocuments(
              schema,
              [parse(newDoc)],
              rules,
            );
            if (!errors.length) {
              updateDoc(newDoc);
            }
          }
        }),
        EditorView.focusChangeEffect.of((state, focusing) => {
          if (readonly || focusing) return null;
          const newDoc = state.doc.toString();
          if (!isDocumentString(newDoc)) return null;
          const errors = validateGraphQlDocuments(
            schema,
            [parse(newDoc)],
            rules,
          );
          if (!errors.length) {
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
