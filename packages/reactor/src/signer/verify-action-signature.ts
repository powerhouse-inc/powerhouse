import type {
  Action,
  ActionSigner,
  CreateDocumentActionInput,
  Signature,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  deriveDocumentId,
  hashActionV2,
  isDerivedDocumentId,
  isV2ActionHash,
  v2TupleProblem,
} from "@powerhousedao/shared/document-model";
import { importDidKey } from "./did-key.js";
import type {
  AdmissionPath,
  SignatureScheme,
  SignatureVerdict,
} from "./types.js";

const RENOWN_HASH_LENGTH = 44;
const SHARED_HASH_LENGTH = 28;
const HEX_SIGNATURE = /^(0x)?([0-9a-fA-F]{2})+$/;

export type VerificationTarget = {
  /** The stream the operation is stored in. */
  documentId: string;
  branch: string;
  /** Of the document `documentId` names; legacy when omitted. */
  policy?: SignaturePolicy;
};

/**
 * Integrity only: identity binding and the live-id check sit with the caller.
 * `operation` is the incoming operation at load admission.
 */
export async function verifyActionSignature(
  action: Action,
  target: VerificationTarget,
  path: AdmissionPath,
  operation?: { timestampUtcMs: string },
): Promise<SignatureVerdict> {
  const policy = target.policy ?? "legacy";
  const refusal = policyRefusal(action, policy);
  if (refusal) {
    return refusal;
  }

  const shape = signerShape(action.context?.signer);
  if (shape.kind === "unsigned") {
    return policy === "v2-required"
      ? refuse(
          "unsigned",
          "UNSIGNED_REQUIRED",
          `action ${action.id} is unsigned but ${target.documentId} requires v2 signatures`,
        )
      : { ok: true, scheme: "unsigned" };
  }
  if (shape.kind === "malformed") {
    return refuse(
      "legacy-unknown",
      "MALFORMED_TUPLE",
      `action ${action.id} ${shape.reason}`,
    );
  }

  const { signer, tuple } = shape;

  const scheme = schemeOf(tuple[2]);

  if (tuple[1] !== signer.app.key) {
    return refuse(
      scheme,
      "KEY_MISMATCH",
      `action ${action.id} tuple key does not match signer.app.key`,
    );
  }

  if (scheme !== "v2" && policy === "v2-required") {
    return refuse(
      scheme,
      "SCHEME_BELOW_POLICY",
      `action ${action.id} carries a legacy tuple but ${target.documentId} requires v2 signatures`,
    );
  }

  if (scheme === "legacy-unknown" && path === "mutation") {
    return refuse(
      scheme,
      "MALFORMED_TUPLE",
      `action ${action.id} carries a hash of unknown length ${tuple[2].length}`,
    );
  }

  if (scheme === "v2") {
    const refusal = await checkV2(action, tuple, target, operation);
    if (refusal) {
      return refusal;
    }
  } else if (path === "mutation") {
    const expected = await legacyHash(scheme, action, target);
    if (expected !== tuple[2]) {
      return refuse(
        scheme,
        "HASH_MISMATCH",
        `action ${action.id} does not match the hash its signature covers`,
      );
    }
  }

  return verifyEcdsa(tuple, scheme, action.id);
}

/** Refusals a document's policy makes before any tuple is read. */
function policyRefusal(
  action: Action,
  policy: SignaturePolicy,
): SignatureVerdict | undefined {
  if (action.type !== "CREATE_DOCUMENT") {
    return undefined;
  }
  const scheme = schemeOfAction(action);
  const input = action.input as CreateDocumentActionInput | undefined;
  const documentId = input?.documentId ?? "";
  if (policy === "legacy") {
    // Otherwise a legacy CREATE could claim the id a v2-required one derives.
    return isDerivedDocumentId(documentId)
      ? refuse(
          scheme,
          "ID_MISMATCH",
          `action ${action.id}: a legacy document cannot take the content-addressed id ${documentId}`,
        )
      : undefined;
  }

  const expected = derivedCreateId(input);
  if (expected === documentId) {
    return undefined;
  }
  return refuse(
    scheme,
    "ID_MISMATCH",
    expected === undefined
      ? `action ${action.id} creates v2-required ${documentId} without the header params its id is derived from`
      : `action ${action.id} creates v2-required ${documentId}, but its header params derive ${expected}`,
  );
}

function derivedCreateId(
  input: CreateDocumentActionInput | undefined,
): string | undefined {
  if (!input?.signing || !input.protocolVersions) {
    return undefined;
  }
  try {
    return deriveDocumentId({
      documentType: input.model,
      createdAtUtcIso: input.signing.createdAtUtcIso,
      nonce: input.signing.nonce,
      protocolVersions: input.protocolVersions,
    });
  } catch {
    return undefined;
  }
}

function schemeOfAction(action: Action): SignatureScheme {
  const shape = signerShape(action.context?.signer);
  if (shape.kind === "unsigned") {
    return "unsigned";
  }
  return shape.kind === "signed" ? schemeOf(shape.tuple[2]) : "legacy-unknown";
}

type SignerShape =
  | { kind: "unsigned" }
  | { kind: "malformed"; reason: string }
  | { kind: "signed"; signer: ActionSigner; tuple: Signature };

/** Peers send arbitrary JSON, so nothing past `context` is assumed. */
function signerShape(value: unknown): SignerShape {
  if (value === undefined || value === null) {
    return { kind: "unsigned" };
  }
  if (!isRecord(value)) {
    return { kind: "malformed", reason: "has a signer that is not an object" };
  }
  const { app, user, signatures } = value;
  if (app !== undefined && app !== null && !isRecord(app)) {
    return {
      kind: "malformed",
      reason: "has a signer.app that is not an object",
    };
  }
  const key = isRecord(app) ? app.key : undefined;
  if (key !== undefined && key !== null && typeof key !== "string") {
    return {
      kind: "malformed",
      reason: "has a signer.app.key that is not a string",
    };
  }
  if (!key) {
    return { kind: "unsigned" };
  }
  if (!isRecord(user) || typeof user.address !== "string") {
    return { kind: "malformed", reason: "has a signer without a user address" };
  }
  if (!Array.isArray(signatures)) {
    return {
      kind: "malformed",
      reason: "has a signer whose signatures are not a list",
    };
  }
  const tuple: unknown = signatures.at(-1);
  if (!isTuple(tuple)) {
    return {
      kind: "malformed",
      reason:
        signatures.length === 0
          ? "has a signer but no signatures"
          : "carries a malformed signature tuple",
    };
  }
  return { kind: "signed", signer: value as ActionSigner, tuple };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function checkV2(
  action: Action,
  tuple: Signature,
  target: VerificationTarget,
  operation: { timestampUtcMs: string } | undefined,
): Promise<SignatureVerdict | undefined> {
  const problem = v2TupleProblem(tuple);
  if (problem) {
    return refuse("v2", "MALFORMED_TUPLE", `action ${action.id}: ${problem}`);
  }

  if (
    operation &&
    !sameInstant(operation.timestampUtcMs, action.timestampUtcMs)
  ) {
    return refuse(
      "v2",
      "TIMESTAMP_MISMATCH",
      `action ${action.id} is stamped ${action.timestampUtcMs} but its operation ${operation.timestampUtcMs}`,
    );
  }

  let expected: string;
  try {
    expected = await hashActionV2(action, target, action.context!.signer!);
  } catch (error) {
    return refuse(
      "v2",
      "HASH_MISMATCH",
      `action ${action.id} has no v2 hash: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (expected !== tuple[2]) {
    return refuse(
      "v2",
      "HASH_MISMATCH",
      `action ${action.id} does not match the hash its signature covers`,
    );
  }
  return undefined;
}

// Stores normalize the operation timestamp's text, so compare instants.
function sameInstant(a: string, b: string): boolean {
  const left = Date.parse(a);
  return !Number.isNaN(left) && left === Date.parse(b);
}

function schemeOf(hash: string): SignatureScheme {
  if (isV2ActionHash(hash)) {
    return "v2";
  }
  if (hash.length === RENOWN_HASH_LENGTH) {
    return "legacy-renown";
  }
  if (hash.length === SHARED_HASH_LENGTH) {
    return "legacy-shared";
  }
  return "legacy-unknown";
}

async function legacyHash(
  scheme: SignatureScheme,
  action: Action,
  target: VerificationTarget,
): Promise<string> {
  if (scheme === "legacy-renown") {
    const payload = [
      action.scope,
      action.type,
      JSON.stringify(action.input),
    ].join("");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payload),
    );
    return bytesToBase64(new Uint8Array(digest));
  }

  const signer = action.context!.signer!;
  return buildOperationSignatureParams({
    documentId: target.documentId,
    signer,
    action,
    previousStateHash: "",
  })[2];
}

async function verifyEcdsa(
  tuple: Signature,
  scheme: SignatureScheme,
  actionId: string,
): Promise<SignatureVerdict> {
  const [timestamp, key, hash, prevStateHash, signatureHex] = tuple;

  if (!HEX_SIGNATURE.test(signatureHex)) {
    return refuse(
      scheme,
      "MALFORMED_TUPLE",
      `action ${actionId} signature is not hex`,
    );
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await importDidKey(key);
  } catch (error) {
    return refuse(
      scheme,
      "MALFORMED_TUPLE",
      `action ${actionId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const message = buildOperationSignatureMessage([
    timestamp,
    key,
    hash,
    prevStateHash,
  ]);

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      hexToBytes(signatureHex).buffer as ArrayBuffer,
      message.buffer as ArrayBuffer,
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    return refuse(
      scheme,
      "BAD_SIGNATURE",
      `action ${actionId} signature does not verify under its key`,
    );
  }
  return { ok: true, scheme };
}

function isTuple(value: unknown): value is Signature {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every((element) => typeof element === "string")
  );
}

function refuse(
  scheme: SignatureScheme,
  code: Extract<SignatureVerdict, { ok: false }>["code"],
  reason: string,
): SignatureVerdict {
  return { ok: false, scheme, code, reason };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
