import { sha256 } from "@noble/hashes/sha2.js";
import { canonicalJson } from "./action-signature.js";
import { bytesToBase64Url } from "./crypto.js";

/** The `protocolVersions` key that fixes a document's signature requirement. */
export const SIGNATURE_PROTOCOL = "signature";

/** `protocolVersions.signature` of a document that requires v2 tuples. */
export const SIGNATURE_PROTOCOL_V2 = 2;

/** `v2-required`: v2 tuples only and a content-addressed id. */
export type SignaturePolicy = "legacy" | "v2-required";

/** What a new document is created as unless the caller or host says otherwise. */
export const DEFAULT_SIGNATURE_POLICY: SignaturePolicy = "v2-required";

export function isSignaturePolicy(value: unknown): value is SignaturePolicy {
  return value === "legacy" || value === "v2-required";
}

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

/**
 * The policy a create call asks for: `signaturePolicy`, else the `signature`
 * key of its `protocolVersions`, else `fallback`, the host's default.
 */
export function requestedSignaturePolicy(
  request:
    | { signaturePolicy?: SignaturePolicy; protocolVersions?: ProtocolVersions }
    | undefined,
  fallback: SignaturePolicy,
): SignaturePolicy {
  if (request?.signaturePolicy) {
    return request.signaturePolicy;
  }
  if (request?.protocolVersions?.[SIGNATURE_PROTOCOL] !== undefined) {
    return signaturePolicyOf(request.protocolVersions);
  }
  return fallback;
}

/** `protocolVersions` for a new document under `policy`, over `base`. */
export function protocolVersionsFor(
  policy: SignaturePolicy,
  base: ProtocolVersions = {},
): ProtocolVersions {
  if (policy === "v2-required") {
    return v2RequiredProtocolVersions(base);
  }
  const { [SIGNATURE_PROTOCOL]: _signature, ...rest } = base;
  return { "base-reducer": 2, ...rest };
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
