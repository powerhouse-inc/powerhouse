// Tuple from `buildOperationSignature`:
// [timestamp, appKey, hash(docId+scope+type+input), previousStateHash, signatureHex].
export type Signature = [string, string, string, string, string];

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

/** The number of params a signature carries. */
const SIGNATURE_PARAM_COUNT = 5;

/** Joins a signature's params for transport. Already-joined input passes through. */
export function serializeSignature(signature: Signature | string): string {
  return Array.isArray(signature)
    ? signature.join(SIGNATURE_PARAM_SEPARATOR)
    : signature;
}

/**
 * Splits a transported signature back into its params. A tuple passes through.
 *
 * Short input is padded rather than refused: verification reads the params by
 * position and fails on a wrong one, which says more than a length complaint
 * raised here would.
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
