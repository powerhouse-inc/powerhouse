import {
  type Action,
  type ActionSigner,
  type Operation,
  type PHDocument,
  type Reducer,
  type User,
  buildSignedAction,
} from "document-model";
import type { User as RenownUser } from "../renown/types.js";

export async function signOperation<TDocument extends PHDocument>(
  operation: Operation,
  sign: (data: Uint8Array) => Promise<Uint8Array>,
  document: TDocument,
  reducer?: Reducer<TDocument>,
  user?: User,
): Promise<Operation> {
  if (!user) return operation;
  if (!operation.action?.context?.signer) return operation;
  if (!reducer) {
    console.error(
      `Document model '${document.header.documentType}' does not have a reducer`,
    );
    return operation;
  }

  const signedAction = await buildSignedAction(
    operation.action,
    reducer,
    document,
    operation.action.context.signer,
    sign,
  );

  return signedAction;
}

export function addActionContext<A extends Action = Action>(
  action: A,
  connectDid?: string,
  user?: RenownUser,
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
