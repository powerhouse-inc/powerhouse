/**
 * A signature of an action.
 *
 * This will be refactored in a future release.
 */
//  [
//     signerAddress,
//     hash (docID, scope, operationID, operationName, operationInput),
//     prevStateHash,
//     signature bytes
//  ]
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
