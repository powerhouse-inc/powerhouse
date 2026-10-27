import type { Action } from "./actions.js";
import type { PHDocument } from "./documents.js";
import type { DocumentAction } from "./types.js";

/** An action the document did not apply; in Connect, an `OperationRejectedError`. */
export type RejectedAction = Error & {
  documentId: string;
  scope: string;
  actionId: string;
  actionType: string;
  /** The operation index the rejected action took. */
  index: number;
  kind: "reducer-error" | "denied";
};

/** What `onSuccess` gets besides the document. */
export type DispatchOutcome = {
  /** The actions the document did not apply, as `onErrors` got them; empty when all applied. */
  rejected: RejectedAction[];
};

/** Dispatches actions to a document; `onErrors`/`onSuccess` report the outcome.
 * In Connect, `onErrors` gets an `OperationRejectedError` per rejected action and runs
 * first; `onSuccess` then gets the document whether or not an action was rejected.
 * Its second argument tells them apart: `outcome.rejected.length === 0` when all applied. */
export type DocumentDispatch<TAction extends Action = Action> = (
  actionOrActions:
    | TAction
    | TAction[]
    | DocumentAction
    | DocumentAction[]
    | undefined,
  onErrors?: (errors: Error[]) => void,
  onSuccess?: (result: PHDocument, outcome: DispatchOutcome) => void,
) => void;
