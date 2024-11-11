import { EditorState, Transaction, Compartment } from "@codemirror/state";
import { EditorView, ViewUpdate, keymap } from "@codemirror/view";
import { ayuLight } from "thememirror";
import { graphql } from "cm6-graphql";
import { useEffect, useRef } from "react";
import { GraphQLSchema, parse } from "graphql";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
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
  doc: string;
  readonly?: boolean;
  updateDoc: (newDoc: string) => void;
};

export function GraphqlEditor(props: Props) {
  const { doc, schema, readonly, updateDoc } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const graphqlCompartment = useRef(new Compartment());

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc,
      extensions: [
        basicSetup,
        ayuLight,
        graphqlCompartment.current.of(
          graphql(schema, {
            showErrorOnInvalidSchema: true,
          }),
        ),
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
          if (!isDocumentString(newDoc)) return;

          try {
            validateGraphQlDocuments(schema, [parse(newDoc)], rules);
            updateDoc(newDoc);
          } catch (e) {
            /* do nothing */
          }
        }),
        EditorState.readOnly.of(!!readonly),
        keymap.of([indentWithTab]),
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
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [readonly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: graphqlCompartment.current.reconfigure(
        graphql(schema, {
          showErrorOnInvalidSchema: true,
        }),
      ),
    });
  }, [schema]);

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
