import { stringify as stringifyJson } from "safe-stable-stringify";
import { createHash as createSha1Hash } from "sha1-uint8array";
import { SIGNATURE_SCHEME_LEGACY, SIGNATURE_SCHEME_V2 } from "./signatures.js";
import type { ActionSignatureContext } from "./types.js";

export const hashBrowser = (
  data: string | Uint8Array | ArrayBufferView | DataView,
  algorithm = "sha1",
  encoding = "base64",
  _params?: Record<string, unknown>,
) => {
  if (!["sha1"].includes(algorithm)) {
    throw new Error(
      `Hashing algorithm not supported: "${algorithm}". Available: sha1`,
    );
  }

  if (!["base64", "hex"].includes(encoding)) {
    throw new Error(
      `Hash encoding not supported: "${encoding}". Available: base64, hex`,
    );
  }

  const hash = hashUIntArray(data, algorithm);

  if (encoding === "hex") {
    return uint8ArrayToHex(hash);
  }

  return uint8ArrayToBase64(hash);
};

function uint8ArrayToBase64(uint8Array: Uint8Array) {
  // Convert the Uint8Array to a binary string
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }

  // Encode the binary string to base64
  const base64String = btoa(binaryString);
  return base64String;
}

function uint8ArrayToHex(uint8Array: Uint8Array) {
  return Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hashUIntArray(
  data: string | Uint8Array | ArrayBufferView,
  algorithm = "sha1",
) {
  if (!["sha1"].includes(algorithm)) {
    throw new Error("Hashing algorithm not supported: Available: sha1");
  }
  return createSha1Hash("sha1")
    .update(data as string)
    .digest();
}

export function getUnixTimestamp(date: Date | string): string {
  return (new Date(date).getTime() / 1000).toFixed(0);
}

/**
 * The parameters a shared action signature covers, the scheme included.
 *
 * Emits {@link SIGNATURE_SCHEME_V2}: the hash binds the action to its document
 * and to one application of itself. The SHA-1 and unversioned SHA-256 forms
 * this used to produce are no longer written, but remain verifiable through
 * {@link computeLegacyActionHashCandidates}.
 */
export async function buildOperationSignatureParams({
  documentId,
  signer,
  action,
  previousStateHash,
}: ActionSignatureContext): Promise<[string, string, string, string, string]> {
  return [
    /*getUnixTimestamp(timestamp)*/ getUnixTimestamp(new Date()),
    signer.app.key,
    await hashActionV2(documentId, action),
    previousStateHash,
    SIGNATURE_SCHEME_V2,
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

/** The structural slice of an action that an action-hash preimage is built from. */
export type ActionHashPreimage = {
  scope: string;
  type: string;
  input: unknown;
};

/** SHA-256 over a string, base64-encoded. */
async function sha256Base64(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return uint8ArrayToBase64(new Uint8Array(digest));
}

/**
 * The preimage an ECDSA-P-256 action signature covers: the document id, the
 * action's scope, type and input, SHA-256 hashed. Shared by the signer and
 * the verifier so the two can never silently diverge again (#2894).
 *
 * The document id leads the preimage, matching the shared scheme, and binds
 * the signature to the document it was made for: replaying it onto another
 * document changes the preimage and the signature stops verifying. When no
 * document id is known at signing time it is empty, which leaves the
 * preimage in the form earlier code signed, so those signatures still verify
 * through the candidates (#2894).
 *
 * The input serializes canonically (sorted keys) rather than with
 * `JSON.stringify`: operations pass through storage round-trips that
 * re-serialize the action, and key order is not part of the action's content -
 * PGlite's JSONB reorders keys, and any order-dependent serialization would
 * leave a genuine signature unable to bind to the action it came from. The
 * canonical form is a function of the input's content only, so the hash is
 * stable across those round-trips.
 */
export async function hashActionContentSha256(
  documentId: string,
  action: ActionHashPreimage,
): Promise<string> {
  return sha256Base64(
    [documentId, action.scope, action.type, stringifyJson(action.input)].join(
      "",
    ),
  );
}

/**
 * The preimage a shared/legacy action signature covers: the document id, scope,
 * type and input, SHA-1 hashed.
 */
export function hashActionContentSha1(
  documentId: string,
  action: ActionHashPreimage,
): string {
  return hashBrowser(
    [documentId, action.scope, action.type, stringifyJson(action.input)].join(
      "",
    ),
  );
}

/**
 * Every action-hash value an unversioned signature's hash field may
 * legitimately carry for the given action. The schemes produced before the
 * scheme field existed cannot be told apart after the fact, so a verifier
 * accepts any of them (#2894).
 *
 * Newest first: the document-bound SHA-256 hash; the same hash without a
 * document id, which is what a signer that did not know the document
 * produced; the insertion-order JSON form, from before the preimage was
 * canonicalized; and the shared SHA-1 scheme.
 *
 * The empty-document-id candidate is what keeps a legacy signature replayable
 * onto another document. That is the cost of accepting these at all, and it is
 * why new signatures use {@link SIGNATURE_SCHEME_V2}.
 */
export async function computeLegacyActionHashCandidates(
  documentId: string,
  action: ActionHashPreimage,
): Promise<string[]> {
  const candidates = [
    await hashActionContentSha256(documentId, action),
    await hashActionContentSha256("", action),
    await sha256Base64(
      [action.scope, action.type, JSON.stringify(action.input)].join(""),
    ),
    ...(documentId ? [hashActionContentSha1(documentId, action)] : []),
  ];
  return [...new Set(candidates)];
}

/** The action fields the v2 preimage covers, beyond the structural slice. */
export type ActionV2HashPreimage = ActionHashPreimage & {
  id: string;
  timestampUtcMs: string;
  context?: { nonce?: string };
};

/**
 * The v2 action hash: SHA-256 over a canonical JSON array of the scheme, the
 * document id, and the action's scope, type, id, nonce, timestamp and input.
 *
 * A JSON array rather than a concatenation, because `join("")` over
 * variable-length strings is not injective - a document id and a scope can
 * split at a different boundary and yield the same preimage.
 *
 * The scheme leads the array, so the hash commits to its own scheme: relabel a
 * v2 signature as legacy and the verifier computes legacy preimages that this
 * hash cannot match, and vice versa. That is what makes the scheme field in
 * the tuple safe to read before the signature has been verified.
 *
 * `id` and `nonce` bind the signature to one application of the action. Without
 * them the same signed content re-submitted under a fresh action id passes the
 * executor's duplicate check and applies again (#2894).
 */
export async function hashActionV2(
  documentId: string,
  action: ActionV2HashPreimage,
): Promise<string> {
  return sha256Base64(
    stringifyJson([
      SIGNATURE_SCHEME_V2,
      documentId,
      action.scope,
      action.type,
      action.id,
      action.context?.nonce ?? "",
      action.timestampUtcMs,
      action.input,
    ]) ?? "",
  );
}

/**
 * The action-hash values a signature of the given scheme may carry. One value
 * for a versioned scheme; the legacy candidate set otherwise.
 */
export async function expectedActionHashes(
  scheme: string,
  documentId: string,
  action: ActionV2HashPreimage,
): Promise<string[]> {
  if (scheme === SIGNATURE_SCHEME_V2) {
    return [await hashActionV2(documentId, action)];
  }
  if (scheme !== SIGNATURE_SCHEME_LEGACY) {
    return [];
  }
  return computeLegacyActionHashCandidates(documentId, action);
}

/**
 * The message a v2 signature covers: the tuple's non-signature params as a
 * canonical JSON array. Delimited, unlike the legacy `join("")`, so a scheme
 * name and a timestamp cannot concatenate ambiguously.
 */
export function buildSignatureMessageV2(
  params: [string, string, string, string, string],
): Uint8Array {
  const message = stringifyJson(params) ?? "";
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

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decodes a base58btc (Bitcoin/IPFS alphabet) string to bytes. Returns null on
 * any character outside the alphabet.
 */
export function base58Decode(input: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const ch of input) {
    let carry = BASE58_ALPHABET.indexOf(ch);
    if (carry === -1) {
      return null;
    }
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Each leading "1" is a leading zero byte.
  for (let k = 0; k < input.length && input[k] === "1"; k++) {
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/** Decodes a base64url string to bytes (portable across node, browsers, workers). */
export function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  if (typeof atob === "function") {
    binary = atob(padded);
  } else {
    binary = Buffer.from(padded, "base64").toString("binary");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
