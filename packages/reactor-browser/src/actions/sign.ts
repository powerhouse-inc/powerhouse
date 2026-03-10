import { logger } from "document-drive";
import type { Action, ActionSigner, PHDocument } from "document-model";
import { buildSignedAction } from "document-model/core";

export async function signAction(action: Action, document: PHDocument) {
  const reactor = window.ph?.reactorClient;
  if (!reactor) return action;

  const documentModelModule = await reactor.getDocumentModelModule(
    document.header.documentType,
  );
  const reducer = documentModelModule.reducer;
  const renown = window.ph?.renown;
  if (!renown?.user) return action;
  if (!action.context?.signer) return action;

  const actionSigner = action.context.signer;
  const unsafeSignedAction = await buildSignedAction(
    action,
    reducer,
    document,
    actionSigner,
    renown.crypto.sign,
  );

  // TODO: this is super dangerous and is caused by the `buildSignedAction` function returning an `Operation` instead of an `Action`
  return unsafeSignedAction as unknown as Action;
}

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

async function makeSignedActionWithContext(
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
  const signedAction = await signAction(action, document);
  const signedActionWithContext = addActionContext(signedAction);
  return signedActionWithContext;
}

export async function makeSignedActionsWithContext(
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

  const signedActionsWithContext = await Promise.all(
    actions.map((action) => makeSignedActionWithContext(action, document)),
  );
  return signedActionsWithContext.filter((a) => a !== undefined);
}
