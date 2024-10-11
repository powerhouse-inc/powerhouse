import stringifyJson from "safe-stable-stringify";
import type {
  Action,
  ActionSigner,
  BaseAction,
  Document,
  Operation,
  OperationSignatureContext,
  OperationSigningHandler,
  OperationVerificationHandler,
  Reducer,
  Signature,
} from "../types";
import { hash } from "./node";

export function getUnixTimestamp(date: Date | string): string {
  return (new Date(date).getTime() / 1000).toFixed(0);
}

export function buildOperationSignatureParams({
  documentId,
  signer,
  operation,
  previousStateHash,
}: OperationSignatureContext): [string, string, string, string] {
  const { timestamp, scope, id, type } = operation;
  return [
    getUnixTimestamp(timestamp), // timestamp,
    signer.app.key, // signer public key
    hash(
      // hash (docID, scope, operationID, operationName, operationInput)
      [documentId, scope, id, type, stringifyJson(operation.input)].join(""),
    ),
    previousStateHash, // state hash that the operation was applied to
  ];
}

const textEncode = new TextEncoder();

export function buildOperationSignatureMessage(
  params: [string, string, string, string],
): Uint8Array {
  const message = params.join("");
  const prefix = "\x19Signed Operation:\n" + message.length.toString();
  return textEncode.encode(prefix + message);
}

export function ab2hex(ab: ArrayBuffer): string {
  return Array.prototype.map
    .call(new Uint8Array(ab), (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");
}

export function hex2ab(hex: string) {
  return new Uint8Array(
    hex.match(/[\da-f]{2}/gi)?.map(function (h) {
      return parseInt(h, 16);
    }) ?? [],
  );
}

export async function buildOperationSignature(
  context: OperationSignatureContext,
  signMethod: OperationSigningHandler,
): Promise<Signature> {
  const params = buildOperationSignatureParams(context);
  const message = buildOperationSignatureMessage(params);
  const signature = await signMethod(message);
  return [...params, `0x${ab2hex(signature)}`];
}

export async function buildSignedOperation<T, A extends Action, L>(
  action: A | Operation<A>,
  reducer: Reducer<T, A, L>,
  document: Document<T, A, L>,
  context: Omit<OperationSignatureContext, "operation" | "previousStateHash">,
  signHandler: OperationSigningHandler,
): Promise<Operation<A | BaseAction>> {
  const result = reducer(document, action, undefined, {
    reuseHash: true,
    reuseOperationResultingState: true,
  });
  const operation = result.operations[action.scope].at(-1);
  if (!operation) {
    throw new Error("Action was not applied");
  }

  const previousStateHash = result.operations[action.scope].at(-2)?.hash ?? "";
  const signature = await buildOperationSignature(
    {
      ...context,
      operation,
      previousStateHash,
    },
    signHandler,
  );

  return {
    ...operation,
    context: {
      ...operation.context,
      signer: {
        ...operation.context?.signer,
        ...context.signer,
        signatures: [...(context.signer.signatures ?? []), signature],
      },
    },
  };
}

export async function verifyOperationSignature<T, A extends Action, L>(
  signature: Signature,
  signer: Omit<ActionSigner, "signatures">,
  verifyHandler: OperationVerificationHandler,
): Promise<boolean> {
  const publicKey = signer.app.key;
  const params = signature.slice(0, 4) as [string, string, string, string];
  const signatureBytes = hex2ab(signature[4]);
  const expectedMessage = buildOperationSignatureMessage(params);
  return verifyHandler(publicKey, signatureBytes, expectedMessage);
}
