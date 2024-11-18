import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate, keymap } from "@codemirror/view";
import { ayuLight } from "thememirror";
import { graphql } from "cm6-graphql";
import { useEffect, useRef } from "react";
import { indentWithTab } from "@codemirror/commands";
import { useSchemaContext } from "../context/schema-context";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { isDocumentString, filterSchema } from "@graphql-tools/utils";
import { Diagnostic, linter } from "@codemirror/lint";
import { GraphQLError, locatedError, parse } from "graphql";
import { validateSDL } from "graphql/validation/validate";

type Props = {
  doc: string;
  readonly?: boolean;
  updateDocumentInModel: (newDoc: string) => void;
  customLinter?: (doc: string) => Diagnostic[];
};

function convertGraphQLErrorToDiagnostic(error: GraphQLError): Diagnostic {
  return {
    from: error.locations?.[0] ? (error.positions?.[0] ?? 0) : 0,
    to: error.locations?.[0] ? (error.positions?.[0] ?? 0) + 1 : 1,
    severity: "error",
    message: error.message,
  };
}

export function GraphqlEditor(props: Props) {
  const { doc, readonly = false, updateDocumentInModel, customLinter } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const graphqlCompartment = useRef(new Compartment());
  const sharedSchema = useSchemaContext();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!viewRef.current) {
      viewRef.current = new EditorView({
        state: EditorState.create({
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
              indentWithTab,
            ]),
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
              }, 300);
            }),
            EditorState.readOnly.of(readonly),
            keymap.of([indentWithTab]),
            linter((view) => {
              const doc = view.state.doc.toString();
              let diagnostics: Diagnostic[] = [];

              if (customLinter) {
                diagnostics = diagnostics.concat(customLinter(doc));
              }

              if (isDocumentString(doc)) {
                try {
                  const newDocNode = parse(doc);

                  const currentTypeNames = new Set(
                    newDocNode.definitions
                      .filter((def) => "name" in def && def.name)
                      .map(
                        (def) =>
                          (def as { name: { value: string } }).name.value,
                      ),
                  );

                  const filteredSchema = filterSchema({
                    schema: sharedSchema,
                    typeFilter: (typeName) => !currentTypeNames.has(typeName),
                  });

                  const errors = validateSDL(newDocNode, filteredSchema)
                    .map((error) => locatedError(error, newDocNode))
                    .filter(
                      (error, index, self) =>
                        index ===
                        self.findIndex(
                          (e) =>
                            e.message === error.message &&
                            e.locations?.[0]?.line ===
                              error.locations?.[0]?.line &&
                            e.locations?.[0]?.column ===
                              error.locations?.[0]?.column,
                        ),
                    );

                  diagnostics = diagnostics.concat(
                    errors.map(convertGraphQLErrorToDiagnostic),
                  );
                } catch (error) {
                  if (error instanceof GraphQLError) {
                    diagnostics.push(convertGraphQLErrorToDiagnostic(error));
                  }
                }
              }

              return diagnostics;
            }),
          ],
        }),
        parent: editorRef.current!,
      });
    }
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

  return <div ref={editorRef} />;
}
