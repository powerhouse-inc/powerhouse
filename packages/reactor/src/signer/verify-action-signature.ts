import type { Action, Signature } from "@powerhousedao/shared/document-model";
import {
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  hashActionV2,
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
  const signer = action.context?.signer;
  if (!signer || !signer.app.key) {
    return { ok: true, scheme: "unsigned" };
  }

  const tuple = signer.signatures.at(-1);
  if (!isTuple(tuple)) {
    return refuse(
      "legacy-unknown",
      "MALFORMED_TUPLE",
      signer.signatures.length === 0
        ? `action ${action.id} has a signer but no signatures`
        : `action ${action.id} carries a malformed signature tuple`,
    );
  }

  const scheme = schemeOf(tuple[2]);

  if (tuple[1] !== signer.app.key) {
    return refuse(
      scheme,
      "KEY_MISMATCH",
      `action ${action.id} tuple key does not match signer.app.key`,
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
