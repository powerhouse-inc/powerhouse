import type { Action, Signature } from "document-model";

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
