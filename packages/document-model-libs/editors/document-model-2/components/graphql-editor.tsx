import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate, keymap } from "@codemirror/view";
import { ayuLight } from "thememirror";
import { graphql } from "cm6-graphql";
import { useEffect, useRef, useMemo } from "react";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { useSchemaContext } from "../context/schema-context";
import { linter, lintGutter, Diagnostic } from "@codemirror/lint";

type Props = {
  id: string;
  doc: string;
  readonly?: boolean;
  updateDocumentInModel: (newDoc: string) => void;
};

export function GraphqlEditor(props: Props) {
  const { id, doc, readonly = false, updateDocumentInModel } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const graphqlCompartment = useRef(new Compartment());
  const { sharedSchema, updateSharedSchema, handleSchemaErrors } =
    useSchemaContext();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const graphqlLinter = useMemo(() => {
    return linter((view) => {
      const doc = view.state.doc.toString();
      const result = handleSchemaErrors(id, doc);

      if (result.success) return [];

      const diagnostics: Diagnostic[] = [];
      const lines = doc.split("\n");
      const errors = result.errors.split("\n");

      for (const error of errors) {
        const lineMatch = /line (\d+)/i.exec(error);
        if (lineMatch) {
          const line = parseInt(lineMatch[1]) - 1;
          const from = view.state.doc.line(line + 1).from;
          const to = view.state.doc.line(line + 1).to;

          diagnostics.push({
            from,
            to,
            severity: "error",
            message: error,
          });
        } else {
          diagnostics.push({
            from: 0,
            to: view.state.doc.length,
            severity: "error",
            message: error,
          });
        }
      }

      return diagnostics;
    });
  }, [id, handleSchemaErrors]);

  useEffect(() => {
    if (viewRef.current) return;
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
        lintGutter(),
        graphqlLinter,
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
            if (!result.success && result.errors) {
              handleSchemaErrors(id, newDoc);
            }
          }, 300);
        }),
        EditorState.readOnly.of(readonly),
        keymap.of([indentWithTab]),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current!,
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

  return (
    <div>
      <div ref={editorRef} />
    </div>
  );
}
