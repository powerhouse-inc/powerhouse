import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate, keymap } from "@codemirror/view";
import { ayuLight } from "thememirror";
import { graphql } from "cm6-graphql";
import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { useSchemaContext } from "../context/schema-context";
import { Errors } from "./errors";

type Props = {
  id: string;
  doc: string;
  readonly?: boolean;
  updateDocumentInModel: (newDoc: string) => void;
};

export function GraphqlEditor(props: Props) {
  const { id, doc, readonly, updateDocumentInModel } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const graphqlCompartment = useRef(new Compartment());
  const { sharedSchema, updateSharedSchema } = useSchemaContext();
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
            if (result.success) {
              setErrors("");
              return;
            }
            if (result.errors) {
              setErrors((prev) => `${prev}\n${result.errors}`);
            }
          }, 300);
        }),
        EditorState.readOnly.of(!!readonly),
        keymap.of([indentWithTab]),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

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
    const result = updateSharedSchema(id, doc);
    if (!result.success) {
      setErrors(result.errors);
    } else {
      setErrors("");
    }
  }, []);

  return (
    <div>
      <div ref={editorRef} />
      <Errors errors={errors} />
    </div>
  );
}
