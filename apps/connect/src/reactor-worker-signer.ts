import type { ReactorFeatureFlags, SignerConfig } from "@powerhousedao/reactor";
import type { ReactorIdentity } from "@powerhousedao/reactor-browser/rpc";
import { RenownCryptoSigner, type IRenownCrypto } from "@renown/sdk/crypto";
import {
  createConnectSignerConfig,
  type RenownTrustEndpoints,
} from "./utils/renown-trust.js";

// Matches the main thread's RenownBuilder("connect").
export const RENOWN_APP_NAME = "connect";

/** The construct fields the worker's signer and trust policy read. */
export type WorkerSignerConstruct = {
  featureFlags?: Partial<ReactorFeatureFlags>;
  // Absent (a tab on an older build) fails the boot under authEnforcement.
  renownEndpoints?: RenownTrustEndpoints;
};

/** The worker's signer; its `user` is updated in place on identity changes. */
export async function createWorkerSignerConfig(
  crypto: IRenownCrypto,
  construct: WorkerSignerConstruct,
  identity: ReactorIdentity | undefined,
): Promise<{ signer: RenownCryptoSigner; signerConfig: SignerConfig }> {
  const signer = new RenownCryptoSigner(crypto, RENOWN_APP_NAME, identity);
  const signerConfig = await createConnectSignerConfig(
    signer,
    construct.featureFlags,
    construct.renownEndpoints ?? {},
  );
  return { signer, signerConfig };
}
