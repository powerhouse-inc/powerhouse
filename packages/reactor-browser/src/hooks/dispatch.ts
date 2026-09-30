import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import { dispatchActions } from "../actions/dispatch.js";

/**
 * Returns a dispatch function for dispatching actions to a document.
 * Used internally by other hooks to provide action dispatching capabilities.
 * @param document - The document to dispatch actions to.
 * @returns A tuple containing the document and a dispatch function.
 */
export type DispatchFn<TAction> = (
  actionOrActions: TAction[] | TAction | undefined,
  onErrors?: (errors: Error[]) => void,
  onSuccess?: (result: PHDocument) => void,
) => void;

export type UseDispatchResult<TDocument, TAction> = readonly [
  TDocument | undefined,
  DispatchFn<TAction>,
];

export function useDispatch<TDocument = PHDocument, TAction = Action>(
  document: TDocument | undefined,
): UseDispatchResult<TDocument, TAction> {
  /**
   * Dispatches actions to the document.
   * @param actionOrActions - The action or actions to dispatch.
   * @param onErrors - Callback invoked with any errors that occurred during action execution,
   * or with the failure when the dispatch itself did not complete.
   */
  function dispatch(
    actionOrActions: TAction[] | TAction | undefined,
    onErrors?: (errors: Error[]) => void,
    onSuccess?: (result: PHDocument) => void,
  ) {
    // A caller waiting on a callback hears exactly once, even on a rejection.
    let answered = false;
    const reportErrors =
      onErrors &&
      ((errors: Error[]) => {
        answered = true;
        onErrors(errors);
      });
    const reportSuccess =
      onSuccess &&
      ((result: PHDocument) => {
        answered = true;
        onSuccess(result);
      });
    dispatchActions(
      actionOrActions,
      document,
      reportErrors,
      reportSuccess,
    ).catch((error: unknown) => {
      logger.error("Failed to dispatch actions: @error", error);
      if (!answered) {
        onErrors?.([error instanceof Error ? error : new Error(String(error))]);
      }
    });
  }
  return [document, dispatch] as const;
}
