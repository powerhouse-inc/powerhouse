import type {
  Action,
  ActionSigningContext,
  ISigner,
  Signature,
} from "@powerhousedao/shared/document-model";

/**
 * A no-op signer that returns empty values for all methods.
 * Used when signing is not required.
 */
export class PassthroughSigner implements ISigner {
  publicKey = {} as unknown as CryptoKey;

  sign(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array(0));
  }

  verify(): Promise<void> {
    return Promise.resolve();
  }

  signAction(
    _action: Action,
    _context: ActionSigningContext,
  ): Promise<Signature> {
    return Promise.resolve(["", "", "", "", ""]);
  }
}
