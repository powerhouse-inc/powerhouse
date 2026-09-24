import { stringify as stringifyJson } from "safe-stable-stringify";
import type { Action } from "./actions.js";
import { buildOperationSignatureMessage } from "./crypto.js";
import type {
  AppActionSigner,
  Signature,
  UserActionSigner,
} from "./signatures.js";
import type { ActionSigningHandler } from "./types.js";

export const ACTION_SIGNATURE_V2_PREFIX = "v2:";

// 32 bytes: 42 free characters, then one whose low two bits are zero.
const V2_HASH = /^v2:[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const V2_TIMESTAMP = /^[0-9]+$/;
const V2_SIGNATURE = /^0x[0-9a-f]{128}$/;
const LONE_SURROGATE = /\p{Cs}/u;
const PREIMAGE_FIELDS = [
  "version",
  "documentId",
  "branch",
  "scope",
  "type",
  "id",
  "timestampUtcMs",
  "input",
  "signer.user.address",
  "signer.user.networkId",
  "signer.user.chainId",
  "signer.app.key",
];

/** The log an operation is stored in, which a v2 tuple is bound to. */
export type ActionSigningTarget = {
  documentId: string;
  branch: string;
};

/** Who a v2 tuple attributes the action to; both halves are in the preimage. */
export type ActionSignerIdentity = {
  user: UserActionSigner;
  app: AppActionSigner;
};

/** A value that would not survive a JSON store round trip unchanged. */
export class CanonicalJsonError extends Error {
  constructor(path: string, detail: string) {
    super(`Cannot canonicalize ${path}: ${detail}`);
    this.name = "CanonicalJsonError";
  }
}

/** Sorted-key JSON, as the state hash encodes; drops `undefined` properties. */
export function canonicalJson(value: unknown, label = "value"): string {
  assertCanonical(value, label, new Set());
  return stringifyJson(value) as string;
}

/** Actions the reactor reduces itself, onto the document scope. */
export const DOCUMENT_SCOPE_ACTION_TYPES: ReadonlySet<string> = new Set([
  "CREATE_DOCUMENT",
  "DELETE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
  "UPDATE_RELATIONSHIP",
]);

/** Where a document-scope action writes: `sourceId` or `documentId`. */
export function targetDocumentId(
  action: { type: string; input: unknown },
  fallback: string,
): string {
  const input = action.input as
    | { documentId?: unknown; sourceId?: unknown }
    | undefined;

  if (
    action.type === "ADD_RELATIONSHIP" ||
    action.type === "REMOVE_RELATIONSHIP" ||
    action.type === "UPDATE_RELATIONSHIP"
  ) {
    return typeof input?.sourceId === "string" && input.sourceId.length > 0
      ? input.sourceId
      : fallback;
  }

  return typeof input?.documentId === "string" && input.documentId.length > 0
    ? input.documentId
    : fallback;
}

/** The log an action submitted to a job on `documentId` is stored in. */
export function actionSigningTarget(
  action: { type: string; input: unknown },
  documentId: string,
  branch: string,
): ActionSigningTarget {
  return {
    documentId: DOCUMENT_SCOPE_ACTION_TYPES.has(action.type)
      ? targetDocumentId(action, documentId)
      : documentId,
    branch,
  };
}

/** The identity a signer writes into `context.signer`, and signs over. */
export function actionSignerIdentity(signer: {
  user?: UserActionSigner;
  app?: AppActionSigner;
}): ActionSignerIdentity {
  return {
    user: {
      address: signer.user?.address ?? "",
      networkId: signer.user?.networkId ?? "",
      chainId: signer.user?.chainId ?? 0,
    },
    app: {
      name: signer.app?.name ?? "",
      key: signer.app?.key ?? "",
    },
  };
}

/** The v2 preimage; throws `CanonicalJsonError` on an unsignable action. */
export function actionPreimageV2(
  action: Action,
  target: ActionSigningTarget,
  signer: ActionSignerIdentity,
): string {
  if (!target.documentId) {
    throw new CanonicalJsonError("documentId", "must not be empty");
  }
  if (!target.branch) {
    throw new CanonicalJsonError("branch", "must not be empty");
  }
  if (action.input === undefined) {
    throw new CanonicalJsonError(
      "input",
      `action ${action.id} (${action.type}) has no input`,
    );
  }
  const fields: unknown[] = [
    "v2",
    target.documentId,
    target.branch,
    action.scope,
    action.type,
    action.id,
    action.timestampUtcMs,
    action.input,
    signer.user.address,
    signer.user.networkId,
    signer.user.chainId,
    signer.app.key,
  ];
  fields.forEach((field, i) => {
    assertCanonical(field, PREIMAGE_FIELDS[i], new Set());
  });
  return stringifyJson(fields) as string;
}

/** `"v2:" + base64url(sha256(preimage))`, unpadded. */
export async function hashActionV2(
  action: Action,
  target: ActionSigningTarget,
  signer: ActionSignerIdentity,
): Promise<string> {
  const preimage = actionPreimageV2(action, target, signer);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(preimage),
  );
  return ACTION_SIGNATURE_V2_PREFIX + bytesToBase64Url(new Uint8Array(digest));
}

/** Signs `action` as a v2 tuple; the message layout is the legacy one. */
export async function signActionV2(params: {
  action: Action;
  target: ActionSigningTarget;
  signer: ActionSignerIdentity;
  sign: ActionSigningHandler;
  previousStateHash?: string;
}): Promise<Signature> {
  const { action, target, signer, sign } = params;
  const previousStateHash = params.previousStateHash ?? "";
  if (previousStateHash.includes(", ")) {
    throw new Error(
      `Cannot sign action ${action.id}: the previous state hash contains ", "`,
    );
  }

  const tuple: [string, string, string, string] = [
    (Date.now() / 1000).toFixed(0),
    signer.app.key,
    await hashActionV2(action, target, signer),
    previousStateHash,
  ];
  const signature = await sign(buildOperationSignatureMessage(tuple));
  if (signature.length !== 64) {
    throw new Error(
      `Cannot sign action ${action.id}: expected a 64-byte P-256 signature, got ${signature.length} bytes`,
    );
  }
  return [...tuple, `0x${bytesToHex(signature)}`];
}

/** Element [2] carries the v2 prefix, whether or not it is well formed. */
export function isV2ActionHash(hash: string): boolean {
  return hash.startsWith(ACTION_SIGNATURE_V2_PREFIX);
}

/** The strict shape of a v2 tuple, apart from what its hash covers. */
export function v2TupleProblem(tuple: Signature): string | undefined {
  if (!V2_TIMESTAMP.test(tuple[0])) {
    return "signing time is not decimal seconds";
  }
  if (!V2_HASH.test(tuple[2])) {
    return "hash is not v2: and 43 base64url characters";
  }
  if (!V2_SIGNATURE.test(tuple[4])) {
    return "signature is not 0x and 128 lowercase hex digits";
  }
  return undefined;
}

function assertCanonical(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): void {
  switch (typeof value) {
    case "string":
      if (LONE_SURROGATE.test(value)) {
        throw new CanonicalJsonError(path, "string holds a lone surrogate");
      }
      return;
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalJsonError(path, `${value} is not a JSON number`);
      }
      return;
    case "undefined":
      throw new CanonicalJsonError(path, "undefined is not a JSON value");
    case "bigint":
      throw new CanonicalJsonError(path, "BigInt is not a JSON value");
    case "function":
    case "symbol":
      throw new CanonicalJsonError(path, `${typeof value} is not a JSON value`);
  }

  if (value === null) {
    return;
  }

  const object = value as object;
  if (ancestors.has(object)) {
    throw new CanonicalJsonError(path, "value is circular");
  }

  const toJSON = (object as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === "function") {
    assertCanonical(
      (toJSON as () => unknown).call(object),
      path,
      new Set(ancestors).add(object),
    );
    return;
  }

  ancestors.add(object);
  if (Array.isArray(object)) {
    for (let i = 0; i < object.length; i++) {
      if (!(i in object)) {
        throw new CanonicalJsonError(`${path}[${i}]`, "array is sparse");
      }
      assertCanonical(object[i], `${path}[${i}]`, ancestors);
    }
  } else {
    for (const [key, child] of Object.entries(object)) {
      if (LONE_SURROGATE.test(key)) {
        throw new CanonicalJsonError(path, "key holds a lone surrogate");
      }
      if (child === undefined) {
        continue;
      }
      assertCanonical(child, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(object);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
