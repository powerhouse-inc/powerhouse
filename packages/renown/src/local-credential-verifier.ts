import { fetchDelegationCredential } from "./credential.js";
import type { SwitchboardRequestFn } from "./switchboard.js";

/** Confirms an authenticated signer's delegation credential is still live. */
export type CredentialCheck = (params: {
  address: string;
  chainId: number;
  appId: string;
}) => Promise<boolean>;

export interface LocalCredentialVerifierOptions {
  /** Notified when the read itself fails; the check then fails closed. */
  onError?: (error: unknown) => void;
}

/** A credential check that reads a Switchboard's own renown read model through
 * `execute`, rather than any Renown or Switchboard over HTTP. */
export function createLocalCredentialVerifier(
  execute: SwitchboardRequestFn,
  options: LocalCredentialVerifierOptions = {},
): CredentialCheck {
  // fetchDelegationCredential turns a read failure into "no credential" — the
  // right verdict, but silent; surface it before it is swallowed.
  const request: SwitchboardRequestFn = async (query, variables) => {
    try {
      return await execute(query, variables);
    } catch (error) {
      options.onError?.(error);
      throw error;
    }
  };

  return async ({ address, chainId, appId }) => {
    const credential = await fetchDelegationCredential({
      address,
      chainId,
      appDid: appId,
      switchboardRequest: request,
    });
    return credential !== undefined;
  };
}
