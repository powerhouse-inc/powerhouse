import { logger } from "document-drive";
import type {
  Action,
  ActionSigner,
  Operation,
  PHDocument,
  Reducer,
  User,
} from "document-model";
import { buildSignedAction } from "document-model";

export async function signOperation(
  operation: Operation,
  sign: (data: Uint8Array) => Promise<Uint8Array>,
  documentId: string,
  document: PHDocument,
  reducer?: Reducer,
  user?: User,
): Promise<Operation> {
  if (!user) return operation;
  if (!operation.action) return operation;
  if (!operation.action?.context) return operation;
  if (!operation.action.context.signer) return operation;
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
