import type { UserActionSigner } from "@powerhousedao/shared/document-model";
import { NodeKeyStorage } from "./node-key-storage.js";
import { RenownCryptoBuilder } from "./renown-crypto-builder.js";
import { RenownCryptoSigner } from "./signer.js";

export type NodeRenownSignerArgs = {
  appName: string;
  /** Defaults to `.ph/.keypair.json` in cwd; `PH_RENOWN_PRIVATE_KEY` wins. */
  keypairPath?: string;
  user?: UserActionSigner;
  /** The did the stored key must have. */
  did?: string;
};

/**
 * Rebuilds the signer of a key another thread already holds, for a pooled
 * reactor worker that cannot be handed the key itself. Never generates a key.
 */
export async function createNodeRenownSigner(
  args: NodeRenownSignerArgs,
): Promise<RenownCryptoSigner> {
  const storage = new NodeKeyStorage(args.keypairPath);
  const stored = await storage.loadKeyPair();
  if (!stored) {
    throw new Error(
      `No Renown keypair at ${args.keypairPath ?? NodeKeyStorage.DEFAULT_KEYPAIR_PATH}`,
    );
  }

  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(storage)
    .build();
  if (args.did !== undefined && crypto.did !== args.did) {
    throw new Error(
      `Renown keypair has did ${crypto.did}, expected ${args.did}`,
    );
  }

  return new RenownCryptoSigner(crypto, args.appName, args.user);
}
