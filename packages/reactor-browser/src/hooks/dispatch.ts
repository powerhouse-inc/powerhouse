import { logger } from "document-drive";
import type { Action, PHDocument } from "document-model";
import { dispatchActions } from "../actions/dispatch.js";

/** Used internally to return the dispatch function for a document. */
export function useDispatch(document: PHDocument | undefined) {
  function dispatch(actionOrActions: Action[] | Action | undefined) {
    dispatchActions(actionOrActions, document).catch(logger.error);
  }
  return [document, dispatch] as const;
}
