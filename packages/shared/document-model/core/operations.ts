import type { Action } from "./actions.js";

/**
 * An operation that was applied to a {@link BaseDocument}.
 *
 * @remarks
 * Wraps an action with an index, to be added to the operations history of a Document.
 * The `index` field is used to keep all operations in order and enable replaying the
 * document's history from the beginning. Note that indices and skips are relative to
 * a specific reactor. Example below:
 *
 * For (index, skip, ts, action)
 * A - [(0, 0, 1, "A0"), (1, 0, 2, "A1")]
 * B - [(0, 0, 0, "B0"), (1, 0, 3, "B1")]
 * ...
 * B gets A's Operations Scenario:
 * B' - [(0, 0, 0, "B0"), (1, 0, 3, "B1"), (2, 1, 1, "A0"), (3, 0, 2, "A1"), (4, 0, 3, "B1")]
 * Then A needs to end up with:
 * A' - [(0, 0, 1, "A0"), (1, 0, 2, "A1"), (2, 2, 0, "B0"), (3, 0, 1, "A0"), (4, 0, 2, "A1"), (5, 0, 3, "B1")]
 * So that both A and B end up with the stream of actions (action):
 * [("B0"), ("A0"), ("A1"), ("B1")]
 *
 * @typeParam A - The type of the action.
 */
export type Operation = {
  /**
   * This is a stable id, derived from various document and action properties
   * in deriveOperationId().
   *
   * It _cannot_ be an arbitrary string.
   *
   * It it also not unique per operation, as reshuffled operations will keep'
   * the same id they had before they were reshuffled. This means that the
   * IOperationStore may have multiple operations with the same operation id.
   **/
  id: string;

  /** Position of the operation in the history. This is relative to a specific reactor -- they may not all agree on this value. */
  index: number;

  /** The number of operations skipped with this Operation. This is relative to a specific reactor -- they may not all agree on this value. */
  skip: number;

  /** Timestamp of when the operation was added */
  timestampUtcMs: string;

  /** Hash of the resulting document data after the operation */
  hash: string;

  /** Error message for a failed action */
  error?: string;

  /** The resulting state after the operation */
  resultingState?: string;

  /**
   * The action that was applied to the document to produce this operation.
   */
  action: Action;
};

/**
 * The operations history of the document by scope.
 *
 * This will be removed in a future release.
 *
 * TODO: Type should be Partial<Record<string, Operation[]>>,
 * but that is a breaking change for codegen + external doc models.
 */
export type DocumentOperations = Record<string, Operation[]>;

export type OperationContext = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  resultingState?: string;

  // This is a _global_ ordinal that is increasing across all documents and scopes.
  ordinal: number;
};

export type OperationWithContext = {
  operation: Operation;
  context: OperationContext;
};
