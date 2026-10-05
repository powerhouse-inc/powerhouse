import type {
  Action,
  ActionSigner,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { logger } from "document-model";

export function addActionContext(action: Action) {
  const renown = window.ph?.renown;
  if (!renown?.user) return action;

  const signer: ActionSigner = {
    app: {
      name: "Connect",
      key: renown.did,
    },
    user: {
      address: renown.user.address,
      networkId: renown.user.networkId,
      chainId: renown.user.chainId,
    },
    signatures: [],
  };

  return {
    context: { signer },
    ...action,
  };
}

function makeSignedActionWithContext(
  action: Action | undefined,
  document: PHDocument | undefined,
) {
  if (!action) {
    logger.error("No action found");
    return;
  }
  if (!document) {
    logger.error("No document found");
    return;
  }
  // The reactor client signs it: an empty signer is filled in for the log the
  // write lands in, which only the client knows.
  return addActionContext(action);
}

export function makeSignedActionsWithContext(
  actionOrActions: Action[] | Action | undefined,
  document: PHDocument | undefined,
) {
  if (!actionOrActions) {
    logger.error("No actions found");
    return;
  }
  const actions = Array.isArray(actionOrActions)
    ? actionOrActions
    : [actionOrActions];

  const signedActionsWithContext = actions.map((action) =>
    makeSignedActionWithContext(action, document),
  );
  return signedActionsWithContext.filter((a) => a !== undefined);
}
