import type {
  ReactorFeatureFlags,
  SignatureTrustPolicy,
  SignerConfig,
} from "@powerhousedao/reactor";
import type { ISigner } from "@powerhousedao/shared/document-model";
import {
  createRenownTrustPolicy,
  resolveSwitchboardEndpoint,
  type RenownOwnSigner,
} from "@renown/sdk/trust";

/** Where the trust policy reads the credentials binding keys to wallets. */
export type RenownTrustEndpoints = {
  /** `connect.renown.url`. */
  renownUrl?: string;
  /** `connect.renown.switchboardUrl`. */
  switchboardUrl?: string;
};

export const MISSING_RENOWN_ENDPOINT_MESSAGE =
  "connect.reactor.featureFlags.authEnforcement is on, but no Renown endpoint " +
  "is configured to verify signers against: set connect.renown.url (or " +
  "connect.renown.switchboardUrl). Without one every signed write would be " +
  "refused.";

/** Under authEnforcement, admits keys a Renown credential binds to the wallet. */
export async function createConnectTrustPolicy(
  featureFlags: Partial<ReactorFeatureFlags> | undefined,
  endpoints: RenownTrustEndpoints,
  ownSigner: RenownOwnSigner,
): Promise<SignatureTrustPolicy | undefined> {
  if (!featureFlags?.authEnforcement) {
    return undefined;
  }
  const renownUrl = endpoints.renownUrl || undefined;
  const switchboardUrl = endpoints.switchboardUrl || undefined;
  if (!renownUrl && !switchboardUrl) {
    throw new Error(MISSING_RENOWN_ENDPOINT_MESSAGE);
  }
  const switchboard = await resolveSwitchboardEndpoint({
    switchboardUrl,
    baseUrl: renownUrl,
  });
  return createRenownTrustPolicy({
    ...(switchboard ? { switchboard } : {}),
    ...(renownUrl ? { renownUrl } : {}),
    ownSigner,
  });
}

/** The reactor host's signer, with the trust policy when authEnforcement is on. */
export async function createConnectSignerConfig(
  signer: ISigner,
  featureFlags: Partial<ReactorFeatureFlags> | undefined,
  endpoints: RenownTrustEndpoints,
): Promise<SignerConfig> {
  const trustPolicy = await createConnectTrustPolicy(
    featureFlags,
    endpoints,
    signer,
  );
  return trustPolicy ? { signer, trustPolicy } : { signer };
}
