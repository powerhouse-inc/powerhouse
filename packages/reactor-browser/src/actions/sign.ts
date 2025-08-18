import { logger } from "document-drive";
import {
  type Action,
  type ActionSigner,
  type PHDocument,
  buildSignedAction,
} from "document-model";

export async function signAction(action: Action, document: PHDocument) {
  const reactor = window.reactor;
  if (!reactor) return action;

  const documentModelModules = reactor.getDocumentModelModules();
  const documentModelModule = documentModelModules.find(
    (module) => module.documentModel.id === document.header.documentType,
  );
  if (!documentModelModule) {
    logger.error(`Document model '${document.header.documentType}' not found`);
    return action;
  }
  const reducer = documentModelModule.reducer;
  const user = window.user;
  const connectCrypto = window.connectCrypto;
  if (!user || !connectCrypto) return action;
  if (!action.context?.signer) return action;

  const actionSigner = action.context.signer;
  const unsafeSignedAction = await buildSignedAction(
    action,
    reducer,
    document,
    actionSigner,
    connectCrypto.sign,
  );

  // TODO: this is super dangerous and is caused by the `buildSignedAction` function returning an `Operation` instead of an `Action`
  return unsafeSignedAction as unknown as Action;
}

export function addActionContext(action: Action) {
  const user = window.user;
  const connectDid = window.did;
  if (!user) return action;

  const signer: ActionSigner = {
    app: {
      name: "Connect",
      key: connectDid || "",
    },
    user: {
      address: user.address,
      networkId: user.networkId,
      chainId: user.chainId,
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
