import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import { useMemo, useRef } from "react";
import {
  dispatchActions,
  type DispatchSuccessCallback,
} from "../actions/dispatch.js";

/** Dispatches actions.
 *
 * Once the write lands, `onErrors` runs first, with an `OperationRejectedError` per action
 * the document did not apply; it is skipped when every action applied. Then `onSuccess`
 * runs with the document and an outcome, whether or not any action was rejected:
 * `outcome.rejected` holds the same errors, and is empty only when every action applied.
 * If `onErrors` throws, `onSuccess` does not run.
 *
 * When nothing lands (no document, no reactor, a failed write), only `onErrors` runs, with why. */
export type DispatchFn<TAction> = (
  actionOrActions: TAction[] | TAction | undefined,
  onErrors?: (errors: Error[]) => void,
  onSuccess?: DispatchSuccessCallback,
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
   * Runs before `onSuccess`.
   * @param onSuccess - Callback invoked with the document once the write lands, after
   * `onErrors` and also when an action was rejected; `outcome.rejected` lists the rejections.
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
    const reportSuccess: DispatchSuccessCallback | undefined =
      onSuccess &&
      ((result, outcome) => {
        answered = true;
        onSuccess(result, outcome);
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

/** Returns the document and a dispatch to it; see `DispatchFn` for the callbacks' order. */
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
