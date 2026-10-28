import type { Action } from "./actions.js";
import type { PHDocument } from "./documents.js";
import { setNameOperation, setPreferredEditorOperation } from "./operations.js";
import { DocumentActionSchema } from "./schemas.js";
import type { PHBaseState } from "./state.js";

/**
 * Applies a base document action (SET_NAME, SET_PREFERRED_EDITOR) to the
 * document. UNDO and REDO apply nothing here.
 */
export function baseActionReducer<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  action: Action,
): PHDocument<TState> {
  // throws if action is not valid base action
  const parsedAction = DocumentActionSchema().parse(action);

  switch (parsedAction.type) {
    // TODO: This needs to be changed to a HEADER scope action if it's changing the header.
    case "SET_NAME":
      return setNameOperation(document, parsedAction.input);
    case "SET_PREFERRED_EDITOR":
      return setPreferredEditorOperation(document, parsedAction.input);
    default:
      return document;
  }
}
