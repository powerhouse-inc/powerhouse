import { logger } from "document-drive";
import type { Action, PHDocument } from "document-model";
import { dispatchActions } from "../actions/dispatch.js";

/**
 * Returns a dispatch function for dispatching actions to a document.
 * Used internally by other hooks to provide action dispatching capabilities.
 * @param document - The document to dispatch actions to.
 * @returns A tuple containing the document and a dispatch function.
 */
export function useDispatch<TDocument = PHDocument, TAction = Action>(
  document: TDocument | undefined,
) {
  /**
   * Dispatches actions to the document.
   * @param actionOrActions - The action or actions to dispatch.
   * @param onErrors - Callback invoked with any errors that occurred during action execution.
   */
  function dispatch(
    actionOrActions: TAction[] | TAction | undefined,
    onErrors?: (errors: Error[]) => void,
  ) {
    dispatchActions(actionOrActions, document, onErrors).catch(logger.error);
  }
  return [document, dispatch] as const;
}
