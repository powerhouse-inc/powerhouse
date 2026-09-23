import { sha256 } from "@noble/hashes/sha2.js";
import { canonicalJson } from "./action-signature.js";

/** The `protocolVersions` key that fixes a document's signature requirement. */
export const SIGNATURE_PROTOCOL = "signature";

/** `protocolVersions.signature` of a document that requires v2 tuples. */
export const SIGNATURE_PROTOCOL_V2 = 2;

/** `v2-required`: v2 tuples only, a content-addressed id, no PRUNE. */
export type SignaturePolicy = "legacy" | "v2-required";

export type ProtocolVersions = { [protocol: string]: number };

// 32 bytes as unpadded base64url; the last character carries two zero bits.
const DERIVED_ID = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

/** Read from a header, a CREATE_DOCUMENT input or a bare map. */
export function signaturePolicyOf(
  source:
    | { protocolVersions?: ProtocolVersions | null }
    | ProtocolVersions
    | null
    | undefined,
): SignaturePolicy {
  const versions =
    source && "protocolVersions" in source
      ? (source.protocolVersions as ProtocolVersions | null | undefined)
      : (source as ProtocolVersions | null | undefined);
  const version = versions?.[SIGNATURE_PROTOCOL];
  return typeof version === "number" && version >= SIGNATURE_PROTOCOL_V2
    ? "v2-required"
    : "legacy";
}

/** `protocolVersions` for a new v2-required document. */
export function v2RequiredProtocolVersions(
  base: ProtocolVersions = {},
): ProtocolVersions {
  return {
    "base-reducer": 2,
    ...base,
    [SIGNATURE_PROTOCOL]: SIGNATURE_PROTOCOL_V2,
  };
}

/** What the id of a v2-required document is a hash of. */
export type DocumentIdParams = {
  documentType: string;
  createdAtUtcIso: string;
  nonce: string;
  protocolVersions: ProtocolVersions;
};

/** `base64url(sha256(canonicalJson(params)))`, unpadded. */
export function deriveDocumentId(params: DocumentIdParams): string {
  const preimage = canonicalJson(
    {
      documentType: params.documentType,
      createdAtUtcIso: params.createdAtUtcIso,
      nonce: params.nonce,
      protocolVersions: params.protocolVersions,
    },
    "document id",
  );
  return bytesToBase64Url(sha256(new TextEncoder().encode(preimage)));
}

/** Whether `id` has the shape `deriveDocumentId` produces. */
export function isDerivedDocumentId(id: string): boolean {
  return DERIVED_ID.test(id);
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
