import {
  checkDelegationCredential,
  fetchDelegationCredential,
  resolveSwitchboardEndpoint,
  verifyDelegationProof,
} from "@renown/sdk";
import type { CredentialVerifier } from "./auth.service.js";
import type { ICredentialKeep } from "./host-auth-state.js";

export interface RenownCredentialVerifierConfig {
  // Renown base URL for the REST/discovery path. Defaults to the SDK default.
  renownUrl?: string;
  // Switchboard GraphQL endpoint; when reachable, read the reactor directly.
  switchboardUrl?: string;
  // Keeps verified credentials so a person stays verified with Renown away.
  keep?: ICredentialKeep;
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
  const source = {
    // Endpoint resolved once at creation: use it, or REST — never re-discover.
    switchboardUrl,
    baseUrl: switchboardUrl ? undefined : config.renownUrl,
  };
  if (config.keep) {
    return keepingVerifier(config.keep, source);
  }

  return async ({ address, chainId, appId }) => {
    const credential = await fetchDelegationCredential({
      address,
      chainId,
      appDid: appId,
      ...source,
      discover: false,
    });
    return credential !== undefined;
  };
}

/**
 * Renown's answer decides when it gives one, and a revocation removes what was
 * kept. Otherwise a kept credential whose proof verifies stands, whatever its
 * date: an expiry during an outage must not lock a person out of their own data.
 */
function keepingVerifier(
  keep: ICredentialKeep,
  source: { switchboardUrl?: string; baseUrl?: string },
): CredentialVerifier {
  return async ({ address, chainId, appId }) => {
    const kept = keep.get(address, chainId, appId);
    const check = await checkDelegationCredential({
      address,
      chainId,
      appDid: appId,
      ...source,
      ...(kept?.expirationDate ? { expirationDate: kept.expirationDate } : {}),
    });
    if (check.status === "active" && check.credential) {
      keep.set(address, chainId, appId, check.credential);
      return true;
    }
    if (check.status === "revoked") {
      keep.delete(address, chainId, appId);
      return false;
    }
    return kept !== undefined && verifyDelegationProof(kept, chainId);
  };
}
