import type { Draft } from "mutative";
import { castDraft, create } from "mutative";
import { noop, type Action } from "./actions.js";
import type { PHDocument } from "./documents.js";
import { nextSkipNumber, sortOperations } from "./documents.js";
import type { PHBaseState } from "./state.js";
import type { LoadStateActionInput } from "./types.js";

// updates the name of the document
export function setNameOperation<TDocument extends PHDocument>(
  document: TDocument,
  input: { name: string },
) {
  return { ...document, header: { ...document.header, name: input.name } };
}

export function undoOperation<TDocument extends PHDocument>(
  document: TDocument,
  action: Action,
  skip: number,
): {
  document: TDocument;
  action: Action;
  skip: number;
  reuseLastOperationIndex: boolean;
} {
  // const scope = action.scope;
  const { scope } = action;

  const defaultResult = {
    document,
    action,
    skip,
    reuseLastOperationIndex: false,
  };

  return create(defaultResult, (draft) => {
    const operations = [...document.operations[scope]];
    const sortedOperations = sortOperations(operations);

    draft.action = noop(scope) as Draft<Action>;

    const lastOperation = sortedOperations.at(-1);
    let nextIndex = lastOperation?.index ?? -1;

    const isNewNoop = lastOperation?.action.type !== "NOOP";

    if (isNewNoop) {
      nextIndex = nextIndex + 1;
    } else {
      draft.reuseLastOperationIndex = true;
    }

    const nextOperationHistory = isNewNoop
      ? [...sortedOperations, { index: nextIndex, skip: 0 }]
      : sortedOperations;

    draft.skip = nextSkipNumber(nextOperationHistory);

    if (lastOperation && draft.skip > lastOperation.skip + 1) {
      // there's an overlap with a previous skip operation
      // (add 1 to the skip value because we are adding a new operation to the history)
      draft.skip = draft.skip + 1;
    }

    if (draft.skip < 0) {
      throw new Error(
        `Cannot undo: you can't undo more operations than the ones in the scope history`,
      );
    }
  });
}

/**
 * V2 of undoOperation for protocol version 2+.
 * Key differences from undoOperation:
 * - Never reuses operation index (always increments)
 * - Always sets skip=1 (consecutive NOOPs are handled during rebuild/GC)
 * - No complex skip calculation - simpler model where each UNDO is independent
 */
export function undoOperationV2<TDocument extends PHDocument>(
  document: TDocument,
  action: Action,
  skip: number,
): {
  document: TDocument;
  action: Action;
  skip: number;
  reuseLastOperationIndex: false;
} {
  const { scope } = action;

  const defaultResult = {
    document,
    action,
    skip,
    reuseLastOperationIndex: false as const,
  };

  return create(defaultResult, (draft) => {
    const operations = document.operations[scope] || [];
    const sortedOperations = sortOperations([...operations]);

    // Count non-NOOP operations to determine if there's anything to undo
    const nonNoopOps = sortedOperations.filter(
      (op) => op.action.type !== "NOOP",
    );

    // Count consecutive NOOPs at the end (these represent pending undos)
    let noopChainLength = 0;
    for (let i = sortedOperations.length - 1; i >= 0; i--) {
      if (sortedOperations[i].action.type === "NOOP") {
        noopChainLength++;
      } else {
        break;
      }
    }

    // Check if we can undo: need more non-NOOP ops than the current NOOP chain
    if (nonNoopOps.length <= noopChainLength) {
      throw new Error(
        `Cannot undo: no more operations to undo in scope history`,
      );
    }

    draft.action = noop(scope) as Draft<Action>;
    draft.skip = 1;
  });
}

export function redoOperation<TDocument extends PHDocument>(
  document: TDocument,
  action: Action,
  skip: number,
): {
  document: TDocument;
  action: Action;
  skip: number;
  reuseLastOperationIndex: boolean;
} {
  const { scope, input } = action;

  const defaultResult = {
    document,
    action,
    skip,
    reuseLastOperationIndex: false,
  };

  return create(defaultResult, (draft) => {
    if (draft.skip > 0) {
      throw new Error(
        `Cannot redo: skip value from reducer cannot be used with REDO action`,
      );
    }

    // Handle both object format { count: number } and legacy number format
    const count =
      typeof input === "object" && input !== null && "count" in input
        ? (input as { count: number }).count
        : input;

    if (typeof count !== "number" || count > 1) {
      throw new Error(`Cannot redo: you can only redo one operation at a time`);
    }

    if (typeof count !== "number" || count < 1) {
      throw new Error(`Invalid REDO action: invalid redo input value`);
    }

    if (draft.document.clipboard.length < 1) {
      throw new Error(`Cannot redo: no operations in the clipboard`);
    }

    const operationIndex = draft.document.clipboard.findLastIndex(
      (op) => op.action.scope === scope,
    );
    if (operationIndex < 0) {
      throw new Error(
        `Cannot redo: no operations in clipboard for scope "${scope}"`,
      );
    }

    const operation = draft.document.clipboard.splice(operationIndex, 1)[0];

    draft.action = castDraft({
      type: operation.action.type,
      scope: operation.action.scope,
      input: operation.action.input,
    } as Action);
  });
}

export function loadStateOperation<TState extends PHBaseState>(
  document: PHDocument<TState>,
  action: LoadStateActionInput,
): PHDocument<TState> {
  return {
    ...document,
    header: { ...document.header, name: action.state.name },
    state: action.state.data as TState,
  };
}

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
