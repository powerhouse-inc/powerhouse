import stringifyJson from "safe-stable-stringify";
import {
  Action,
  ActionSigner,
  BaseDocument,
  Operation,
  OperationSignatureContext,
  OperationSigningHandler,
  OperationVerificationHandler,
  Reducer,
  Signature,
} from "../types.js";
import { generateUUID, hash } from "./node.js";

export function generateId(method?: "UUIDv4"): string {
  if (method && method.toString() !== "UUIDv4") {
    throw new Error(
      `Id generation method not supported: "${method.toString()}"`,
    );
  }
  return generateUUID();
}

export function getUnixTimestamp(date: Date | string): string {
  return (new Date(date).getTime() / 1000).toFixed(0);
}

export function buildOperationSignatureParams<TGlobalState, TLocalState>({
  documentId,
  signer,
  operation,
  previousStateHash,
}: OperationSignatureContext<TGlobalState, TLocalState>): [
  string,
  string,
  string,
  string,
] {
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

export function ab2hex(ab: ArrayBuffer | ArrayBufferView): string {
  const view = ArrayBuffer.isView(ab) ? ab : new Uint8Array(ab);
  return Array.prototype.map
    .call(view, (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");
}

export function hex2ab(hex: string) {
  return new Uint8Array(
    hex.match(/[\da-f]{2}/gi)?.map(function (h) {
      return parseInt(h, 16);
    }) ?? [],
  );
}

export async function buildOperationSignature<TGlobalState, TLocalState>(
  context: OperationSignatureContext<TGlobalState, TLocalState>,
  signMethod: OperationSigningHandler,
): Promise<Signature> {
  const params = buildOperationSignatureParams(context);
  const message = buildOperationSignatureMessage(params);
  const signature = await signMethod(message);
  return [...params, `0x${ab2hex(signature)}`];
}

export async function buildSignedOperation<TGlobalState, TLocalState>(
  action: Action,
  reducer: Reducer<TGlobalState, TLocalState, Action>,
  document: BaseDocument<TGlobalState, TLocalState>,
  context: Omit<
    OperationSignatureContext<TGlobalState, TLocalState>,
    "operation" | "previousStateHash"
  >,
  signHandler: OperationSigningHandler,
) {
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
  } as Operation<TGlobalState, TLocalState>;
}

export async function verifyOperationSignature(
  signature: Signature,
  signer: Omit<ActionSigner, "signatures">,
  verifyHandler: OperationVerificationHandler,
) {
  const publicKey = signer.app.key;
  const params = signature.slice(0, 4) as [string, string, string, string];
  const signatureBytes = hex2ab(signature[4]);
  const expectedMessage = buildOperationSignatureMessage(params);
  return verifyHandler(publicKey, signatureBytes, expectedMessage);
}
