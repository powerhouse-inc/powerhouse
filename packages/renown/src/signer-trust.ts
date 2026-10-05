import type { ActionSigner } from "@powerhousedao/shared/document-model";
import { DEFAULT_RENOWN_URL } from "./constants.js";
import { verifyDelegationProof } from "./credential.js";
import { SwitchboardClient, type SwitchboardSource } from "./switchboard.js";
import type { PowerhouseVerifiableCredential } from "./types.js";

type SignerUser = ActionSigner["user"];

/** A signer whose `app.key` and `user` are read on every ask. */
export interface RenownOwnSigner {
  readonly app?: { readonly key: string };
  readonly user?: SignerUser;
}

export interface RenownTrustPolicyOptions {
  /** Serves the renown read model; without it, Renown's REST API is read. */
  switchboard?: SwitchboardSource;
  /** Renown base URL for the REST lookup. Defaults to DEFAULT_RENOWN_URL. */
  renownUrl?: string;
  /** This node's signer, read on every ask; its key signing as its current user is accepted without a lookup. Wins over `self`. */
  ownSigner?: RenownOwnSigner;
  /**
   * A snapshot of this node's key and user, for a pooled worker whose signer
   * cannot cross the thread boundary. Only matches the worker's own key.
   */
  self?: { key: string; user: SignerUser };
  /** How many acceptances are remembered. Defaults to 10000. */
  maxAccepted?: number;
  /** How long a refusal is remembered before asking again. Defaults to 60s. */
  refusalTtlMs?: number;
}

/** Structurally a reactor `SignatureTrustPolicy`. */
export interface RenownTrustPolicy {
  authorizeSigner(
    signer: ActionSigner,
    key: string,
    documentId: string,
  ): Promise<boolean>;
}

const DEFAULT_MAX_ACCEPTED = 10_000;
const DEFAULT_REFUSAL_TTL_MS = 60_000;

/**
 * Accepts a key the user's EIP-712 Renown credential delegates to, ignoring
 * expiry and revocation. Verdicts are cached per (address, key); this node's
 * own key is checked before the cache and never cached.
 */
export function createRenownTrustPolicy(
  options: RenownTrustPolicyOptions = {},
): RenownTrustPolicy {
  const maxAccepted = options.maxAccepted ?? DEFAULT_MAX_ACCEPTED;
  const refusalTtlMs = options.refusalTtlMs ?? DEFAULT_REFUSAL_TTL_MS;
  const client = options.switchboard
    ? new SwitchboardClient(options.switchboard)
    : undefined;
  const renownUrl = options.renownUrl ?? DEFAULT_RENOWN_URL;

  const accepted = new Set<string>();
  const refusedUntil = new Map<string, number>();
  const pending = new Map<string, Promise<boolean>>();

  const issued = (
    user: SignerUser,
    key: string,
  ): Promise<PowerhouseVerifiableCredential[]> =>
    client
      ? client.getIssuedCredentials({
          address: user.address,
          chainId: user.chainId,
          appDid: key,
        })
      : fetchIssuedCredentialRest(user, key, renownUrl);

  async function lookup(user: SignerUser, key: string): Promise<boolean> {
    for (const credential of await issued(user, key)) {
      if (
        bindsTo(credential, user, key) &&
        (await verifyDelegationProof(credential, user.chainId))
      ) {
        return true;
      }
    }
    return false;
  }

  function remember(entry: string, verdict: boolean): void {
    if (verdict) {
      if (accepted.size >= maxAccepted) {
        const oldest = accepted.values().next().value;
        if (oldest !== undefined) accepted.delete(oldest);
      }
      accepted.add(entry);
      refusedUntil.delete(entry);
    } else {
      refusedUntil.set(entry, Date.now() + refusalTtlMs);
    }
  }

  return {
    authorizeSigner(signer, key) {
      const user = signer.user as SignerUser | undefined;
      const self = ownIdentity(options);
      if (self && isSelf(self, user, key)) {
        return Promise.resolve(true);
      }
      if (!user || !isLookupable(user, key)) {
        return Promise.resolve(false);
      }

      const entry = `${user.networkId}|${user.chainId}|${user.address.toLowerCase()}|${key}`;
      if (accepted.has(entry)) {
        return Promise.resolve(true);
      }
      const until = refusedUntil.get(entry);
      if (until !== undefined && until > Date.now()) {
        return Promise.resolve(false);
      }
      const inFlight = pending.get(entry);
      if (inFlight) {
        return inFlight;
      }

      const verdict = lookup(user, key).then(
        (result) => {
          pending.delete(entry);
          remember(entry, result);
          return result;
        },
        (error: unknown) => {
          pending.delete(entry);
          throw error;
        },
      );
      pending.set(entry, verdict);
      return verdict;
    },
  };
}

function ownIdentity(
  options: RenownTrustPolicyOptions,
): RenownTrustPolicyOptions["self"] {
  if (!options.ownSigner) {
    return options.self;
  }
  const { app, user } = options.ownSigner;
  return {
    key: app?.key ?? "",
    user: {
      address: user?.address ?? "",
      networkId: user?.networkId ?? "",
      chainId: user?.chainId ?? 0,
    },
  };
}

function isSelf(
  self: NonNullable<RenownTrustPolicyOptions["self"]>,
  user: SignerUser | undefined,
  key: string,
): boolean {
  return (
    self.key !== "" &&
    key === self.key &&
    (user?.address ?? "").toLowerCase() === self.user.address.toLowerCase() &&
    (user?.networkId ?? "") === self.user.networkId &&
    (user?.chainId ?? 0) === self.user.chainId
  );
}

function isLookupable(user: SignerUser, key: string): boolean {
  return (
    key.startsWith("did:key:") &&
    /^0x[0-9a-fA-F]{40}$/.test(user.address) &&
    user.networkId !== "" &&
    Number.isInteger(user.chainId) &&
    user.chainId > 0
  );
}

function bindsTo(
  credential: PowerhouseVerifiableCredential,
  user: SignerUser,
  key: string,
): boolean {
  const address = user.address.toLowerCase();
  const issuer = credential.issuer.id.split(":");
  if (issuer.length !== 5) return false;
  const [scheme, method, networkId, chainId, issuerAddress] = issuer;
  return (
    credential.credentialSubject.id === key &&
    scheme === "did" &&
    method === "pkh" &&
    networkId === user.networkId &&
    chainId === String(user.chainId) &&
    issuerAddress.toLowerCase() === address &&
    credential.issuer.ethereumAddress.toLowerCase() === address
  );
}

// Renown's REST endpoint answers with the active credential only.
async function fetchIssuedCredentialRest(
  user: SignerUser,
  key: string,
  renownUrl: string,
): Promise<PowerhouseVerifiableCredential[]> {
  const url = new URL("/api/auth/credential", renownUrl);
  url.searchParams.set("address", user.address);
  url.searchParams.set("chainId", String(user.chainId));
  url.searchParams.set("connectId", key);
  url.searchParams.set("appId", key);
  const response = await fetch(url, { method: "GET" });
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(`Renown credential lookup failed: ${response.status}`);
  }
  const { credential } = (await response.json()) as {
    credential?: PowerhouseVerifiableCredential | null;
  };
  return credential ? [credential] : [];
}
