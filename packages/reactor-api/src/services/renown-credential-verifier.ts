import {
  fetchDelegationCredential,
  resolveSwitchboardEndpoint,
} from "@renown/sdk";
import type { CredentialVerifier } from "./auth.service.js";

export interface RenownCredentialVerifierConfig {
  // Renown base URL for the REST/discovery path. Defaults to the SDK default.
  renownUrl?: string;
  // Switchboard GraphQL endpoint; when reachable, read the reactor directly.
  switchboardUrl?: string;
}

// A CredentialVerifier backed by Renown. Resolves the switchboard endpoint once
// at creation so each verify call skips discovery; falls back to REST otherwise.
export async function createRenownCredentialVerifier(
  config: RenownCredentialVerifierConfig = {},
): Promise<CredentialVerifier> {
  const switchboardUrl = await resolveSwitchboardEndpoint({
    switchboardUrl: config.switchboardUrl,
    baseUrl: config.renownUrl,
  });

  return async ({ address, chainId, appId }) => {
    const credential = await fetchDelegationCredential({
      address,
      chainId,
      appDid: appId,
      // Endpoint resolved once at creation: use it, or REST — never re-discover.
      switchboardUrl,
      baseUrl: switchboardUrl ? undefined : config.renownUrl,
      discover: false,
    });
    return credential !== undefined;
  };
}
