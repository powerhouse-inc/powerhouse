import { actionSigner, operationWithContext } from "#document";
import { generateUUID, hash } from "#utils";
import stringifyJson from "safe-stable-stringify";
import {
  type Action,
  type ActionContext,
  type ActionSignatureContext,
  type ActionSigner,
  type ActionSigningHandler,
  type ActionVerificationHandler,
  type PHDocument,
  type Reducer,
  type Signature,
} from "../types.js";

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

export function buildOperationSignatureParams({
  documentId,
  signer,
  action,
  previousStateHash,
}: ActionSignatureContext): [string, string, string, string] {
  const { /*id, timestamp,*/ scope, type } = action;
  return [
    /*getUnixTimestamp(timestamp)*/ getUnixTimestamp(new Date()),
    signer.app.key,
    hash(
      [documentId, scope, /*id,*/ type, stringifyJson(action.input)].join(""),
    ),
    previousStateHash,
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

export async function buildOperationSignature(
  context: ActionSignatureContext,
  signMethod: ActionSigningHandler,
): Promise<Signature> {
  const params = buildOperationSignatureParams(context);
  const message = buildOperationSignatureMessage(params);
  const signature = await signMethod(message);
  return [...params, `0x${ab2hex(signature)}`];
}

export async function buildSignedAction<TDocument extends PHDocument>(
  action: Action,
  reducer: Reducer<TDocument>,
  document: TDocument,
  signer: ActionSigner,
  signHandler: ActionSigningHandler,
) {
  const result = reducer(document, action, undefined, {
    //reuseHash: true,
    reuseOperationResultingState: true,
  });
  const operation = result.operations[action.scope].at(-1);
  if (!operation) {
    throw new Error("Action was not applied");
  }

  const previousStateHash = result.operations[action.scope].at(-2)?.hash ?? "";
  const signature = await buildOperationSignature(
    {
      documentId: document.header.id,
      signer,
      action,
      previousStateHash,
    },
    signHandler,
  );

  const actionContext: ActionContext = {
    signer: actionSigner(signer.user, signer.app, [
      ...signer.signatures,
      signature,
    ]),
  };

  return operationWithContext(operation, actionContext);
}

export async function verifyOperationSignature(
  signature: Signature,
  signer: Omit<ActionSigner, "signatures">,
  verifyHandler: ActionVerificationHandler,
) {
  const publicKey = signer.app.key;
  const params = signature.slice(0, 4) as [string, string, string, string];
  const signatureBytes = hex2ab(signature[4]);
  const expectedMessage = buildOperationSignatureMessage(params);
  return verifyHandler(publicKey, signatureBytes, expectedMessage);
}
