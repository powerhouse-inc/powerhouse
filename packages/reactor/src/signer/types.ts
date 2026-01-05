import type { ISigner, SignatureVerificationHandler } from "document-model";

export type { SignatureVerificationHandler };

/**
 * Configuration for signing and verification.
 */
export type SignerConfig = {
  /**
   * The signer used to sign actions before submission.
   */
  signer: ISigner;

  /**
   * Optional handler for verifying signatures on incoming operations.
   * If not provided, signature verification will be skipped.
   */
  verifier?: SignatureVerificationHandler;
};
