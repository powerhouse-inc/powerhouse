import type { Action, Operation, Signature } from "document-model";

/**
 * Interface for signing actions before submission to the reactor.
 */
export interface ISigner {
  /**
   * Signs an action
   *
   * @param action - The action to sign
   * @param abortSignal - Optional abort signal to cancel the signing
   * @returns The signature
   */
  sign(action: Action, abortSignal?: AbortSignal): Promise<Signature>;
}

/**
 * Handler for verifying operation signatures.
 *
 * @param operation - The operation to verify
 * @param publicKey - The public key to verify against (from signer.app.key)
 * @returns Promise that resolves to true if signature is valid, false otherwise
 */
export type SignatureVerificationHandler = (
  operation: Operation,
  publicKey: string,
) => Promise<boolean>;

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
