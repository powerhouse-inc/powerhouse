import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk";
import type { ISigner } from "@powerhousedao/shared/document-model";

const APP_NAME = "reactor-bench";

export type BenchSigner = {
  signer: ISigner;
  did: string;
  publicKeyJwk: JsonWebKey;
};

export async function makeBenchSigner(): Promise<BenchSigner> {
  const storage = new MemoryKeyStorage();
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(storage)
    .build();
  const signer = new RenownCryptoSigner(crypto, APP_NAME);
  const publicKeyJwk = await globalThis.crypto.subtle.exportKey(
    "jwk",
    crypto.publicKey,
  );
  return { signer, did: crypto.did, publicKeyJwk };
}
