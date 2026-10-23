import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import { useMemo, useRef } from "react";
import { dispatchActions } from "../actions/dispatch.js";

/** Dispatches actions. `onErrors` gets an `OperationRejectedError` per action the document
 * did not apply, or why the dispatch failed; `onSuccess` gets the document once it lands. */
export type DispatchFn<TAction> = (
  actionOrActions: TAction[] | TAction | undefined,
  onErrors?: (errors: Error[]) => void,
  onSuccess?: (result: PHDocument) => void,
) => void;

export type UseDispatchResult<TDocument, TAction> = readonly [
  TDocument | undefined,
  DispatchFn<TAction>,
];

/** A dispatch to the document `getDocument` returns when it runs. */
export function createDispatch<TDocument = PHDocument, TAction = Action>(
  getDocument: () => TDocument | undefined,
): DispatchFn<TAction> {
  /**
   * Dispatches actions to the document.
   * @param actionOrActions - The action or actions to dispatch.
   * @param onErrors - Callback invoked with an `OperationRejectedError` for each action the
   * document did not apply, or with the failure when the dispatch itself did not complete.
   */
  return function dispatch(actionOrActions, onErrors, onSuccess) {
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
      getDocument(),
      reportErrors,
      reportSuccess,
    ).catch((error: unknown) => {
      logger.error("Failed to dispatch actions: @error", error);
      if (!answered) {
        onErrors?.([error instanceof Error ? error : new Error(String(error))]);
      }
    });
  };
}

export function useDispatch<TDocument = PHDocument, TAction = Action>(
  document: TDocument | undefined,
): UseDispatchResult<TDocument, TAction> {
  // Stable per document id; it always dispatches against the latest document.
  const latest = useRef(document);
  latest.current = document;
  const id = (document as PHDocument | undefined)?.header.id;
  const dispatch = useMemo(
    () => createDispatch<TDocument, TAction>(() => latest.current),
    [id],
  );
  return [document, dispatch] as const;
}
