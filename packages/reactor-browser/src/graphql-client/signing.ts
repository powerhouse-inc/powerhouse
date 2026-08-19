import type {
  Action,
  DocumentModelModule,
  ISigner,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { hashDocumentStateForScope } from "@powerhousedao/shared/document-model";

/**
 * Stamps an action with the head of the scope it targets.
 *
 * `prevOpHash` is the hash of the scope state the action is meant to apply to;
 * for a document at head that is the hash of the last operation in the scope,
 * which the read path cannot fetch, so it is recomputed from the state.
 * `prevOpIndex` is the index of that last operation: revisions count
 * operations and indices are zero based, so an empty scope stamps `-1`, which
 * matches what the remote controller records.
 *
 * `revision` overrides the scope revision the index is derived from. Only a
 * batch needs it - {@link prepareSignedActions} stamps action N at the revision
 * the N actions before it will have produced, which the document itself does
 * not know yet. `prevOpHash` always comes from the supplied document's state.
 */
export function stampAction(
  action: Action,
  document: PHDocument,
  revision = document.header.revision[action.scope] ?? 0,
): Action {
  return {
    ...action,
    context: {
      ...action.context,
      prevOpHash: hashDocumentStateForScope(document, action.scope),
      prevOpIndex: revision - 1,
    },
  };
}

/**
 * Signs a stamped action, preserving any signatures it already carries.
 *
 * The signer reads `context.prevOpHash` off the action, so this must run after
 * {@link stampAction}.
 */
export async function signStampedAction(
  action: Action,
  signer: ISigner,
  signal?: AbortSignal,
): Promise<Action> {
  const actionSigner = action.context?.signer;
  const user = actionSigner?.user ?? signer.user;
  const app = actionSigner?.app ?? signer.app;
  if (!user || !app) {
    throw new Error(
      "cannot sign an action: the signer has no user or app identity",
    );
  }

  const signature = await signer.signAction(action, signal);
  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user,
        app,
        signatures: [...(actionSigner?.signatures ?? []), signature],
      },
    },
  };
}

/**
 * Actions a snapshot batch cannot predict the next state for.
 *
 * `UNDO`, `REDO` and `PRUNE` rewrite history the light read path never fetched
 * (and the reducer appends no operation for them); `NOOP` is only ever produced
 * by an undo chain; the document-scope actions run through the reactor's
 * document-action handler rather than a document-model reducer
 * (`DOCUMENT_SCOPE_ACTIONS` in packages/reactor/src/executor/util.ts) and
 * `UPGRADE_DOCUMENT` changes which reducer applies mid-batch.
 */
const unsupportedBatchActions: ReadonlySet<string> = new Set([
  "UNDO",
  "REDO",
  "PRUNE",
  "NOOP",
  "CREATE_DOCUMENT",
  "DELETE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
  "UPDATE_RELATIONSHIP",
]);

/**
 * The base-reducer protocol version to predict with when the snapshot's header
 * carries none.
 *
 * `baseReducer` reads `baseReducerVersion(document.header)` for every action and
 * throws when the header has no `protocolVersions` - and a header built by
 * {@link phDocumentFromGetDocument} never has one, because the GraphQL
 * `PHDocument` type does not expose it. The version only selects between the v1
 * and v2 UNDO/NOOP branches, and every action reaching the prediction loop is an
 * ordinary append-only one, so it cannot change the predicted state here; it is
 * passed purely so the lookup does not throw.
 */
const predictionProtocolVersion = 2;

/**
 * Stamps and signs a batch of actions against one document snapshot, so every
 * action carries the head its predecessor will leave behind.
 *
 * The server executes the array in order, each action against the state the one
 * before it produced. The snapshot the light client reads has correct state and
 * per-scope revisions but NO operation history (see `adapter.ts`), so the chain
 * is predicted here: reduce action N over the working document to get the state
 * action N+1 hashes, and carry a virtual revision alongside it. The revision has
 * to be tracked separately because the reducer derives operation indices from
 * the last stored operation, and with an empty history that counts from zero
 * rather than from the document's real revision.
 *
 * A single action needs no prediction and therefore no `module`, which keeps
 * today's callers working unchanged. Two or more require the document's exact
 * reducer, one shared scope (the reactor rejects mixed-scope jobs) and only
 * append-only actions. Anything else rejects: a batch that cannot be predicted
 * must fail before the mutation, never be downgraded to unsigned.
 */
export async function prepareSignedActions(
  actions: readonly Action[],
  snapshot: PHDocument,
  signer: ISigner,
  module?: DocumentModelModule<any>,
  signal?: AbortSignal,
): Promise<Action[]> {
  if (actions.length === 0) {
    return [];
  }

  if (actions.length === 1) {
    return [
      await signStampedAction(
        stampAction(actions[0], snapshot),
        signer,
        signal,
      ),
    ];
  }

  const scope = sharedScope(actions);
  assertSupportedBatch(actions);

  if (!module) {
    throw new Error(
      `cannot sign ${actions.length} actions: no document model module for ${snapshot.header.documentType} was supplied, so the batch state cannot be predicted`,
    );
  }

  // A working copy: the reducer never writes to its input, but the scope's
  // operation list is read back below, so it must exist even for a scope the
  // snapshot's `revisionsList` did not mention.
  let working: PHDocument = {
    ...snapshot,
    operations: {
      ...snapshot.operations,
      [scope]: [...(snapshot.operations[scope] ?? [])],
    },
  };
  let revision = snapshot.header.revision[scope] ?? 0;

  const signed: Action[] = [];
  for (const [index, action] of actions.entries()) {
    throwIfAborted(signal, index);

    const stamped = stampAction(action, working, revision);
    const signedAction = await signStampedAction(stamped, signer, signal);
    signed.push(signedAction);

    // The last action's state is never hashed by anything, but reducing it
    // anyway is what proves the whole batch is applicable before it is sent.
    const before = scopeOperationCount(working, scope);
    let next: PHDocument;
    try {
      next = module.reducer(working, signedAction, undefined, {
        protocolVersion:
          working.header.protocolVersions?.["base-reducer"] ??
          predictionProtocolVersion,
      });
    } catch (error) {
      throw new Error(
        `cannot sign action ${index} (${action.type}): the ${snapshot.header.documentType} reducer rejected it, so the rest of the batch cannot be predicted`,
        { cause: error },
      );
    }

    const after = scopeOperationCount(next, scope);
    if (after !== before + 1) {
      throw new Error(
        `cannot sign action ${index} (${action.type}): the reducer appended ${after - before} operations to ${scope}, expected exactly 1`,
      );
    }

    working = next;
    // Deliberately not `next.operations[scope].at(-1).index`: those indices
    // count from the snapshot's empty history, not from the document's head.
    revision += 1;
  }

  return signed;
}

/**
 * How many operations a scope holds.
 *
 * The index signature types the array as always present, but a module's reducer
 * is arbitrary code: one that hands back a document without the scope should
 * produce the actionable error above, not a `TypeError` on `.length`.
 */
function scopeOperationCount(document: PHDocument, scope: string): number {
  const operations: Record<string, Operation[] | undefined> =
    document.operations;
  return operations[scope]?.length ?? 0;
}

/** The one scope a reactor job may span (`getSharedActionScope`). */
function sharedScope(actions: readonly Action[]): string {
  const scope = actions[0].scope;
  const mixed = actions.find((action) => action.scope !== scope);
  if (mixed) {
    throw new Error(
      `cannot sign a batch spanning scopes "${scope}" and "${mixed.scope}": every action in one request must share a scope`,
    );
  }
  return scope;
}

function assertSupportedBatch(actions: readonly Action[]): void {
  const unsupported = actions.find((action) =>
    unsupportedBatchActions.has(action.type),
  );
  if (unsupported) {
    throw new Error(
      `cannot sign a batch containing ${unsupported.type}: it needs operation history or an alternate executor path, so send it as a single action`,
    );
  }
}

function throwIfAborted(signal: AbortSignal | undefined, index: number): void {
  if (signal?.aborted) {
    throw new Error(`signing aborted before action ${index}`, {
      cause: signal.reason as unknown,
    });
  }
}
