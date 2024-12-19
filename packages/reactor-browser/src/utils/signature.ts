import {
  Action,
  ActionSigner,
  Document,
  Operation,
  OperationSignatureContext,
  Reducer,
  User,
  utils,
} from "document-model/document";
import type { User as RenownUser } from "../renown/types";

export async function signOperation<
  State = unknown,
  A extends Action = Action,
  LocalState = unknown,
>(
  operation: Operation<A>,
  sign: (data: Uint8Array) => Promise<Uint8Array>,
  documentId: string,
  document: Document<State, A, LocalState>,
  reducer?: Reducer<State, A, LocalState>,
  user?: User,
): Promise<Operation<A>> {
  if (!user) return operation;
  if (!operation.context) return operation;
  if (!operation.context.signer) return operation;
  if (!reducer) {
    console.error(
      `Document model '${document.documentType}' does not have a reducer`,
    );
    return operation;
  }

  const context: Omit<
    OperationSignatureContext,
    "operation" | "previousStateHash"
  > = {
    documentId,
    signer: operation.context.signer,
  };

  const signedOperation = await utils.buildSignedOperation<
    State,
    A,
    LocalState
  >(operation, reducer, document, context, sign);

  return signedOperation as Operation<A>;
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
