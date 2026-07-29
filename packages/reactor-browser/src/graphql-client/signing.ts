import type {
  Action,
  ISigner,
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
 */
export function stampAction(action: Action, document: PHDocument): Action {
  const revision = document.header.revision[action.scope] ?? 0;
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
): Promise<Action> {
  const actionSigner = action.context?.signer;
  const user = actionSigner?.user ?? signer.user;
  const app = actionSigner?.app ?? signer.app;
  if (!user || !app) {
    throw new Error(
      "cannot sign an action: the signer has no user or app identity",
    );
  }

  const signature = await signer.signAction(action);
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
