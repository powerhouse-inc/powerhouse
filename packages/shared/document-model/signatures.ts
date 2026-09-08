// Tuple from `buildOperationSignature`:
// [timestamp, appKey, actionHash, previousStateHash, signatureHex, scheme].
// `scheme` names the preimage the hash and the signed message were built
// from. It is optional so signatures written before it existed still type
// as a `Signature`; absent or empty means `SIGNATURE_SCHEME_LEGACY`.
export type Signature = [string, string, string, string, string, string?];

/**
 * The unversioned schemes produced before the scheme field existed. A verifier
 * accepts any of the preimages those producers used - see
 * `computeLegacyActionHashCandidates` - because none of them can be told apart
 * after the fact.
 */
export const SIGNATURE_SCHEME_LEGACY = "";

/**
 * Document-bound scheme: the action hash covers the document id, scope, type,
 * action id, nonce, timestamp and input, serialized canonically, and the
 * signed message is delimited rather than concatenated (#2894).
 */
export const SIGNATURE_SCHEME_V2 = "v2";

/** The scheme a signature was produced under. */
export function signatureScheme(signature: Signature): string {
  return signature[5] ?? SIGNATURE_SCHEME_LEGACY;
}

/**
 * A user action signer.
 */
export type UserActionSigner = {
  address: string;
  networkId: string; // CAIP-2
  chainId: number; // CAIP-10
};

/**
 * An app action signer.
 */
export type AppActionSigner = {
  name: string; // Connect
  key: string;
};

/**
 * An action signer.
 */
export type ActionSigner = {
  user: UserActionSigner;
  app: AppActionSigner;
  signatures: Signature[];
};

/**
 * Information to verify the document creator.
 */
export type PHDocumentSignatureInfo = {
  /**
   * The public key of the document creator.
   **/
  publicKey: JsonWebKey;

  /** The nonce that was appended to the message to create the signature. */
  nonce: string;
};

/**
 * What separates a signature's params when it travels as one string.
 *
 * GraphQL declares `signatures` as a list of strings, not a list of lists, so a
 * tuple is joined for transport and split on arrival. The separator is here so
 * the two halves cannot disagree about it - they live in different packages, and
 * a mismatch would corrupt every signature that crossed the wire rather than
 * failing outright.
 */
const SIGNATURE_PARAM_SEPARATOR = ", ";

/** The number of params a signature carries, the scheme field included. */
const SIGNATURE_PARAM_COUNT = 6;

/**
 * Joins a signature's params for transport. Already-joined input passes through.
 *
 * A legacy signature - one with no scheme - serializes to the five params it
 * has always serialized to, so re-transporting stored signatures does not
 * rewrite them.
 */
export function serializeSignature(signature: Signature | string): string {
  if (!Array.isArray(signature)) {
    return signature;
  }
  const params = signature[5] ? signature : signature.slice(0, 5);
  return params.join(SIGNATURE_PARAM_SEPARATOR);
}

/**
 * Splits a transported signature back into its params. A tuple passes through.
 *
 * Short input is padded rather than refused: verification reads the params by
 * position and fails on a wrong one, which says more than a length complaint
 * raised here would. A five-param value pads to an empty scheme, which is
 * exactly what a legacy signature means.
 */
export function deserializeSignature(signature: Signature | string): Signature {
  if (Array.isArray(signature)) {
    return signature;
  }
  const parts = signature.split(SIGNATURE_PARAM_SEPARATOR);
  return Array.from(
    { length: SIGNATURE_PARAM_COUNT },
    (_unused, index) => parts[index] ?? "",
  ) as Signature;
}

/**
 * Configuration for hashing document state in operations.
 */
export type HashConfig = {
  /** The hashing algorithm to use (e.g., "sha1", "sha256") */
  algorithm: string;

  /** The encoding format for the hash output (e.g., "base64", "hex") */
  encoding: string;

  /** Optional algorithm-specific parameters */
  params?: Record<string, unknown>;
};

/**
 * Parses a signature's hash field (element [3]).
 *
 * The field is either a plain `prevStateHash`, or
 * `prevStateHash:resultingStateHash` when the signer also committed to the
 * state its action produces.
 *
 * @param hashField - The 4th element of a Signature tuple
 * @returns The declared previous state hash and, when carried, the resulting one
 */
export function parseSignatureHashField(hashField: string): {
  prevStateHash: string;
  resultingStateHash: string | undefined;
} {
  const colonIndex = hashField.indexOf(":");

  if (colonIndex === -1) {
    return {
      prevStateHash: hashField,
      resultingStateHash: undefined,
    };
  }

  return {
    prevStateHash: hashField.substring(0, colonIndex),
    resultingStateHash: hashField.substring(colonIndex + 1),
  };
}

/**
 * Extracts the resulting state hash from a signature, if present.
 */
export function extractResultingHashFromSignature(
  signature: Signature,
): string | undefined {
  const hashField = signature[3];
  const { resultingStateHash } = parseSignatureHashField(hashField);
  return resultingStateHash;
}

/**
 * Checks if a signature includes a resulting state hash.
 */
export function signatureHasResultingHash(signature: Signature): boolean {
  return extractResultingHashFromSignature(signature) !== undefined;
}
