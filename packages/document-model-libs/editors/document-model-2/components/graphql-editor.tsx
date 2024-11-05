import { Annotation, EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { ayuLight } from "thememirror";
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
const skipUpdateAnnotation = Annotation.define<boolean>();
type Props = {
  schema: GraphQLSchema;
  doc: string;
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
      doc: doc || "",
      extensions: [
        basicSetup,
        ayuLight,
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
          // Check if the transaction has the skipUpdateAnnotation
          if (
            update.transactions.some((tr) =>
              tr.annotation(skipUpdateAnnotation),
            )
          ) {
            return;
          }
          if (update.docChanged) {
            const newDoc = update.state.doc.toString();
            if (!newDoc || newDoc === doc || !isDocumentString(newDoc)) return;
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
          if (!newDoc || newDoc === doc) return null;
          updateDoc(newDoc);
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
        annotations: skipUpdateAnnotation.of(true),
      });
    }
  }, [doc]);

  return <div ref={editorRef} />;
}
