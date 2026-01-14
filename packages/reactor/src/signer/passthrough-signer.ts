import type { ISigner, Signature } from "document-model";

/**
 * A no-op signer that returns empty values for all methods.
 * Used when signing is not required.
 */
export class PassthroughSigner implements ISigner {
  publicKey(): Promise<JsonWebKey> {
    return Promise.resolve({});
  }

  sign(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array(0));
  }

  verify(): Promise<void> {
    return Promise.resolve();
  }

  signAction(): Promise<Signature> {
    return Promise.resolve(["", "", "", "", ""]);
  }
}
