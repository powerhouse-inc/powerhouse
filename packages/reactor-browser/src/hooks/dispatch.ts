import { logger } from "document-drive";
import type { Action, PHDocument } from "document-model";
import { dispatchActions } from "../actions/dispatch.js";

/** Used internally to return the dispatch function for a document. */
export function useDispatch<TDocument = PHDocument, TAction = Action>(
  document: TDocument | undefined,
) {
  function dispatch(actionOrActions: TAction[] | TAction | undefined) {
    dispatchActions(actionOrActions, document).catch(logger.error);
  }
  return [document, dispatch] as const;
}
