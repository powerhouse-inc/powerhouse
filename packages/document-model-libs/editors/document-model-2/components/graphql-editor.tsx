import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate, keymap } from "@codemirror/view";
import { ayuLight } from "thememirror";
import { graphql } from "cm6-graphql";
import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { useSchemaContext } from "../context/schema-context";

type Props = {
  id: string;
  readonly?: boolean;
  updateDocumentInModel: (newDoc: string) => void;
};

export function GraphqlEditor(props: Props) {
  const { id, readonly, updateDocumentInModel } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const graphqlCompartment = useRef(new Compartment());
  const { sharedSchema, getDocument, updateSharedSchema, handleSchemaErrors } =
    useSchemaContext();
  const doc = getDocument(id);
  const [errors, setErrors] = useState("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc,
      extensions: [
        basicSetup,
        ayuLight,
        graphqlCompartment.current.of(graphql(sharedSchema)),
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
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            updateDocumentInModel(newDoc);
            const result = updateSharedSchema(id, newDoc);
            if (!result.success) {
              setErrors(result.errors);
            } else {
              setErrors("");
            }
          }, 300);
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
      effects: graphqlCompartment.current.reconfigure(graphql(sharedSchema)),
    });
  }, [sharedSchema]);

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

  useEffect(() => {
    const result = handleSchemaErrors(id, doc);
    if (!result.success) {
      setErrors(result.errors);
    } else {
      setErrors("");
    }
  }, []);

  return (
    <div>
      <div ref={editorRef} />
      <p className="mt-1 text-red-500">{errors}</p>
    </div>
  );
}
