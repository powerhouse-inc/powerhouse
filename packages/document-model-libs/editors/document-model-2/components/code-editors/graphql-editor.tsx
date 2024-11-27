import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { ayuLight } from "thememirror";
import { getSchema, graphql } from "cm6-graphql";
import { memo, useEffect, useRef } from "react";
import { useSchemaContext } from "../../context/schema-context";
import { Diagnostic, forceLinting } from "@codemirror/lint";
import { buildSchema, printSchema } from "graphql";
import {
  makeLinter,
  useEditorRefs,
  useEditorCleanup,
  useHandlerReconfiguration,
  useDocumentSync,
  baseEditorExtensions,
  baseKeymap,
  makeFocusHandler,
  makePasteHandler,
  makeUpdateHandler,
} from "./utils";

type Props = {
  doc: string;
  readonly?: boolean;
  updateDocumentInModel?: (newDoc: string) => void;
  customLinter?: (doc: string) => Diagnostic[];
};

export const GraphqlEditor = memo(function GraphqlEditor(props: Props) {
  const { doc, readonly = false, updateDocumentInModel, customLinter } = props;
  const {
    editorRef,
    viewRef,
    updateListenerCompartment,
    focusHandlerCompartment,
    pasteHandlerCompartment,
    timeoutRef,
  } = useEditorRefs();

  // GraphQL-specific refs
  const graphqlCompartment = useRef(new Compartment());
  const linterCompartment = useRef(new Compartment());
  const sharedSchema = useSchemaContext();

  useEffect(() => {
    if (!viewRef.current) {
      const schema = buildSchema(sharedSchema);
      viewRef.current = new EditorView({
        state: EditorState.create({
          doc,
          extensions: [
            ...baseEditorExtensions,
            keymap.of(baseKeymap),
            ayuLight,
            graphqlCompartment.current.of(graphql(schema)),
            linterCompartment.current.of(makeLinter(schema, customLinter)),
            updateListenerCompartment.current.of(
              makeUpdateHandler(readonly, timeoutRef, updateDocumentInModel),
            ),
            focusHandlerCompartment.current.of(
              makeFocusHandler(readonly, timeoutRef, updateDocumentInModel),
            ),
            pasteHandlerCompartment.current.of(
              makePasteHandler(readonly, timeoutRef, updateDocumentInModel),
            ),
            EditorState.readOnly.of(readonly),
          ],
        }),
        parent: editorRef.current!,
      });
      forceLinting(viewRef.current);
    }
  }, []);

  useEditorCleanup(viewRef);

  /* GraphQL-specific: Reconfigures the editor when the schema changes */
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

  useHandlerReconfiguration(
    viewRef.current,
    readonly,
    timeoutRef,
    updateDocumentInModel,
    {
      updateListener: updateListenerCompartment.current,
      focusHandler: focusHandlerCompartment.current,
      pasteHandler: pasteHandlerCompartment.current,
    },
  );

  useDocumentSync(viewRef.current, doc);

  return <div ref={editorRef} />;
});
