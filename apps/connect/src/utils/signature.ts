import { logger } from "document-drive";
import {
  buildSignedAction,
  type Action,
  type ActionSigner,
  type Operation,
  type PHBaseState,
  type PHDocument,
  type Reducer,
  type User,
} from "document-model";

export async function signOperation<TState extends PHBaseState = PHBaseState>(
  operation: Operation,
  sign: (data: Uint8Array) => Promise<Uint8Array>,
  documentId: string,
  document: PHDocument<TState>,
  reducer?: Reducer<TState>,
  user?: User,
): Promise<Operation> {
  if (!user) return operation;
  if (!operation.action.context?.signer) return operation;
  if (!reducer) {
    logger.error(
      `Document model '${document.header.documentType}' does not have a reducer`,
    );
    return operation;
  }

  const context: ActionSigner = operation.action.context.signer;

  const signedOperation = await buildSignedAction(
    operation.action,
    reducer,
    document,
    context,
    sign,
  );

  return signedOperation;
}

export function addActionContext<A extends Action = Action>(
  action: A,
  connectDid?: string,
  user?: User,
) {
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
