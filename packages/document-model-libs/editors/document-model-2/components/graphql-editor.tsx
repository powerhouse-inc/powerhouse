import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, ViewUpdate, keymap } from "@codemirror/view";
import { ayuLight } from "thememirror";
import { getSchema, graphql } from "cm6-graphql";
import { memo, useEffect, useRef } from "react";
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
import { forceLinting, lintKeymap } from "@codemirror/lint";
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
import {
  buildSchema,
  GraphQLError,
  GraphQLSchema,
  locatedError,
  parse,
  printSchema,
} from "graphql";
import { validateSDL } from "graphql/validation/validate";

type Props = {
  doc: string;
  readonly?: boolean;
  /* Updates the document in the model, should be wrapped in `useCallback` in the parent */
  updateDocumentInModel?: (newDoc: string) => void;
  /* Custom linter to add special lint rules for specific documents, should be wrapped in `useCallback` in the parent */
  customLinter?: (doc: string) => Diagnostic[];
};

/* Converts a GraphQLError to a Diagnostic
   GraphQLError uses a zero-indexed line and column, but the editor uses a one-indexed line and column
*/
function convertGraphQLErrorToDiagnostic(error: GraphQLError): Diagnostic {
  return {
    from: error.locations?.[0] ? (error.positions?.[0] ?? 0) : 0,
    to: error.locations?.[0] ? (error.positions?.[0] ?? 0) + 1 : 1,
    severity: "error",
    message: error.message,
  };
}

/* Creates a linter that checks the document for errors
   This works in combination with the built-in linting provided by the graphql extension
   We need to recreate this linter when the schema changes or if a custom linter is provided
   It first checks the document for linting errors
   Then it checks if the document is a valid document string
   Then it checks if the document is valid against the schema
*/
function makeLinter(
  schema: GraphQLSchema,
  customLinter?: (doc: string) => Diagnostic[],
) {
  return linter((view) => {
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
            .map((def) => (def as { name: { value: string } }).name.value),
        );

        // we need to filter out the existing types in the document from the schema to prevent duplicate type errors in the validation
        const filteredSchema = filterSchema({
          schema,
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
                  e.locations?.[0]?.line === error.locations?.[0]?.line &&
                  e.locations?.[0]?.column === error.locations?.[0]?.column,
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
  });
}

export const GraphqlEditor = memo(function GraphqlEditor(props: Props) {
  const { doc, readonly = false, updateDocumentInModel, customLinter } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const graphqlCompartment = useRef(new Compartment());
  const linterCompartment = useRef(new Compartment());
  const sharedSchema = useSchemaContext();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!viewRef.current) {
      const schema = buildSchema(sharedSchema);
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
            graphqlCompartment.current.of(graphql(schema)),
            linterCompartment.current.of(makeLinter(schema, customLinter)),
            EditorView.lineWrapping,
            EditorView.theme({
              "&": { fontSize: "18px" },
            }),
            EditorView.updateListener.of((update: ViewUpdate) => {
              if (readonly || !update.docChanged) return;
              // since we also update the editor from the outside when the document changes, we need to ignore those updates
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
                updateDocumentInModel?.(newDoc);
              }, 500);
            }),
            EditorState.readOnly.of(readonly),
            keymap.of([indentWithTab]),
          ],
        }),
        parent: editorRef.current!,
      });
      forceLinting(viewRef.current);
    }
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  /* Reconfigures the editor when the schema changes */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const existingSchema = getSchema(view.state);
    const existingSchemaString = existingSchema
      ? printSchema(existingSchema)
      : null;
    if (!existingSchema || existingSchemaString !== sharedSchema) {
      try {
        const newSchema = buildSchema(sharedSchema);

        view.dispatch({
          effects: [
            graphqlCompartment.current.reconfigure(graphql(newSchema)),
            linterCompartment.current.reconfigure(
              makeLinter(newSchema, customLinter),
            ),
          ],
        });
        forceLinting(view);
      } catch (error) {
        console.debug("in schema update", error);
      }
    }
  }, [sharedSchema, customLinter]);

  /* Updates the editor when the document changes */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== doc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: doc },
        annotations: [Transaction.userEvent.of("external")],
      });
      forceLinting(view);
    }
  }, [doc]);

  return <div ref={editorRef} />;
});
