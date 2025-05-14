import { updateTimeout } from "#document-model-editor/constants/documents";
import { safeParseSdl } from "#document-model-editor/context/schema-context";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  type Diagnostic,
  forceLinting,
  linter,
  lintKeymap,
} from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  rectangularSelection,
  type ViewUpdate,
} from "@codemirror/view";
import { filterSchema } from "@graphql-tools/utils";
import { GraphQLError, type GraphQLSchema, locatedError } from "graphql";
import { validateSDL } from "graphql/validation/validate.js";
import { useEffect, useRef } from "react";

/* Converts a GraphQLError to a Diagnostic
   GraphQLError uses a zero-indexed line and column, but the editor uses a one-indexed line and column
*/
export function convertGraphQLErrorToDiagnostic(
  error: GraphQLError,
): Diagnostic {
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
export function makeLinter(
  schema: GraphQLSchema,
  customLinter?: (doc: string) => Diagnostic[],
) {
  return linter((view) => {
    const doc = view.state.doc.toString();
    let diagnostics: Diagnostic[] = [];

    if (customLinter) {
      diagnostics = diagnostics.concat(customLinter(doc));
    }

    const newDocNode = safeParseSdl(doc);

    if (newDocNode) {
      try {
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

export function makeUpdateHandler(
  readonly: boolean | undefined,
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  updateDocumentInModel?: (newDoc: string) => void,
) {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (!!readonly || !update.docChanged) return;
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
    }, updateTimeout);
  });
}

export function makeFocusHandler(
  readonly: boolean | undefined,
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  updateDocumentInModel?: (newDoc: string) => void,
) {
  return EditorView.focusChangeEffect.of((state, focusing) => {
    if (!!readonly || focusing) return null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    const newDoc = state.doc.toString();
    updateDocumentInModel?.(newDoc);
    return null;
  });
}

export function makePasteHandler(
  readonly: boolean | undefined,
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  updateDocumentInModel?: (newDoc: string) => void,
) {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      if (readonly) return false;
      const newDoc = view.state.doc.toString();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      updateDocumentInModel?.(newDoc);
      forceLinting(view);
      return false;
    },
  });
}

export type EditorConfig = {
  doc: string;
  readonly?: boolean;
  updateDocumentInModel?: (newDoc: string) => void;
};

export function useEditorRefs() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const updateListenerCompartment = useRef(new Compartment());
  const focusHandlerCompartment = useRef(new Compartment());
  const pasteHandlerCompartment = useRef(new Compartment());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return {
    editorRef,
    viewRef,
    updateListenerCompartment,
    focusHandlerCompartment,
    pasteHandlerCompartment,
    timeoutRef,
  };
}

export function useEditorCleanup(
  viewRef: React.MutableRefObject<EditorView | null>,
) {
  useEffect(() => {
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);
}

export function useHandlerReconfiguration(
  view: EditorView | null,
  readonly: boolean | undefined,
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  updateDocumentInModel: ((newDoc: string) => void) | undefined,
  compartments: {
    updateListener: Compartment;
    focusHandler: Compartment;
    pasteHandler: Compartment;
  },
) {
  useEffect(() => {
    if (!view) return;
    view.dispatch({
      effects: [
        compartments.updateListener.reconfigure(
          makeUpdateHandler(readonly, timeoutRef, updateDocumentInModel),
        ),
        compartments.focusHandler.reconfigure(
          makeFocusHandler(readonly, timeoutRef, updateDocumentInModel),
        ),
        compartments.pasteHandler.reconfigure(
          makePasteHandler(readonly, timeoutRef, updateDocumentInModel),
        ),
      ],
    });
    forceLinting(view);
  }, [readonly, updateDocumentInModel]);
}

export function useDocumentSync(view: EditorView | null, doc: string) {
  useEffect(() => {
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
}

export const baseEditorExtensions = [
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
  EditorView.lineWrapping,
];

export const baseKeymap = [
  ...closeBracketsKeymap,
  ...defaultKeymap,
  ...searchKeymap,
  ...historyKeymap,
  ...foldKeymap,
  ...completionKeymap,
  ...lintKeymap,
  indentWithTab,
];
