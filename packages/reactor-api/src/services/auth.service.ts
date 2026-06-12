import {
  verifyAuthBearerToken,
  type PowerhouseVerifiableCredential,
} from "@renown/sdk";

type VerifiedCredential =
  Awaited<ReturnType<typeof verifyAuthBearerToken>> extends false | infer T
    ? T
    : never;
export interface AuthConfig {
  enabled: boolean;
  admins: string[];
  skipCredentialVerification?: boolean; // Skip Renown API credential verification (useful for testing)
  credentialVerificationCacheTtlMs?: number; // How long successful Renown credential checks are cached; 0 disables caching
}

const DEFAULT_CREDENTIAL_CACHE_TTL_MS = 60_000;
const CREDENTIAL_CACHE_MAX_ENTRIES = 1_000;

interface CredentialCacheEntry {
  exists: Promise<boolean>;
  expiresAt: number;
}

export interface User {
  address: string;
  chainId: number;
  networkId: string;
}

export interface AuthContext {
  user?: User;
  admins: string[];
  auth_enabled: boolean;
}

export class AuthService {
  private readonly config: AuthConfig;
  private readonly credentialCache = new Map<string, CredentialCacheEntry>();

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async authenticateRequest(
    request: globalThis.Request,
  ): Promise<AuthContext | globalThis.Response> {
    if (!this.config.enabled) {
      return { user: undefined, admins: [], auth_enabled: false };
    }
    const method = request.method;
    if (method === "OPTIONS" || method === "GET") {
      return {
        user: undefined,
        admins: this.config.admins,
        auth_enabled: true,
      };
    }
    return this.verifyBearer(request.headers.get("authorization") ?? undefined);
  }

  /**
   * Verify a Bearer token regardless of HTTP method. Use this from non-GraphQL
   * middleware that must enforce authentication on every request.
   */
  async verifyBearer(
    authorization: string | undefined,
  ): Promise<AuthContext | globalThis.Response> {
    if (!this.config.enabled) {
      return { user: undefined, admins: [], auth_enabled: false };
    }
    const token = authorization?.split(" ")[1];
    if (!token) {
      return {
        user: undefined,
        admins: this.config.admins,
        auth_enabled: true,
      };
    }
    try {
      const verified = await this.verifyToken(token);
      if (!verified) {
        return new Response(JSON.stringify({ error: "Verification failed" }), {
          status: 401,
        });
      }
      const user = this.extractUserFromVerification(verified);
      if (!user) {
        return new Response(JSON.stringify({ error: "Missing credentials" }), {
          status: 401,
        });
      }
      if (!this.config.skipCredentialVerification) {
        const credentialExists = await this.verifyCredentialExists(
          user.address,
          user.chainId,
          verified.issuer,
        );
        if (!credentialExists) {
          return new Response(
            JSON.stringify({ error: "Credentials no longer valid" }),
            { status: 401 },
          );
        }
      }
      return { user, admins: this.config.admins, auth_enabled: true };
    } catch {
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        status: 401,
      });
    }
  }

  async authenticateWebSocketConnection(
    connectionParams: Record<string, unknown>,
  ): Promise<User | null> {
    if (!this.config.enabled) {
      return null;
    }

    const authHeader = connectionParams.authorization as string | undefined;
    if (!authHeader) {
      throw new Error("Missing authorization in connection parameters");
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      throw new Error("Invalid authorization format");
    }

    const verified = await this.verifyToken(token);
    if (!verified) {
      throw new Error("Token verification failed");
    }

    const user = this.extractUserFromVerification(verified);
    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Verify that the credentials still exist on the Renown API
    // This can be skipped via config (useful for testing or when Renown API is unavailable)
    if (!this.config.skipCredentialVerification) {
      const credentialExists = await this.verifyCredentialExists(
        user.address,
        user.chainId,
        verified.issuer,
      );
      if (!credentialExists) {
        throw new Error("Credentials no longer valid");
      }
    }

    // Note: We no longer block based on global allowed lists.
    // Authorization is handled at the resolver level based on document permissions.

    return user;
  }

  /**
   * Verify the auth bearer token
   */
  private async verifyToken(token: string) {
    return await verifyAuthBearerToken(token);
  }

  /**
   * Extract user information from verification result
   */
  private extractUserFromVerification(
    verified: VerifiedCredential,
  ): User | null {
    try {
      const { address, chainId, networkId } =
        verified.verifiableCredential.credentialSubject;

      if (!address || !chainId || !networkId) {
        return null;
      }

      return {
        address,
        chainId,
        networkId,
      };
    } catch {
      return null;
    }
  }

  /**
   * Verify that the credential still exists on the Renown API.
   *
   * Results are cached per (address, chainId, issuer) for a short TTL so the
   * blocking external round-trip is not paid on every request. Concurrent
   * checks for the same key share a single in-flight request, and entries
   * that resolve to false are evicted immediately so failed or revoked
   * credentials are re-checked on the next request.
   */
  private verifyCredentialExists(
    address: string,
    chainId: number,
    appId: string,
  ): Promise<boolean> {
    const ttlMs =
      this.config.credentialVerificationCacheTtlMs ??
      DEFAULT_CREDENTIAL_CACHE_TTL_MS;
    if (ttlMs <= 0) {
      return this.fetchCredentialExists(address, chainId, appId);
    }

    const key = `${address.toLowerCase()}:${chainId}:${appId}`;
    const now = Date.now();
    const cached = this.credentialCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.exists;
    }

    this.pruneCredentialCache(now);
    const entry: CredentialCacheEntry = {
      exists: this.fetchCredentialExists(address, chainId, appId).then(
        (exists) => {
          if (!exists && this.credentialCache.get(key) === entry) {
            this.credentialCache.delete(key);
          }
          return exists;
        },
      ),
      expiresAt: now + ttlMs,
    };
    this.credentialCache.set(key, entry);
    return entry.exists;
  }

  /**
   * Enforce the cache size cap before inserting a new entry: drop expired
   * entries first, then evict oldest-inserted entries (insertion order
   * matches expiry order since the TTL is constant) until under the cap, so
   * a flood of distinct keys cannot grow the map without bound.
   */
  private pruneCredentialCache(now: number): void {
    if (this.credentialCache.size < CREDENTIAL_CACHE_MAX_ENTRIES) {
      return;
    }
    for (const [key, entry] of this.credentialCache) {
      if (entry.expiresAt <= now) {
        this.credentialCache.delete(key);
      }
    }
    while (this.credentialCache.size >= CREDENTIAL_CACHE_MAX_ENTRIES) {
      const oldestKey = this.credentialCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.credentialCache.delete(oldestKey);
    }
  }

  /**
   * Fetch the credential from the Renown API and validate it against the
   * expected address, chainId and issuer. Never throws; returns false on any
   * network or validation failure.
   */
  private async fetchCredentialExists(
    address: string,
    chainId: number,
    appId: string,
  ): Promise<boolean> {
    const url = `https://www.renown.id/api/auth/credential?address=${address}&chainId=${chainId}&connectId=${appId}&appId=${appId}`;
    try {
      const response = await fetch(url, {
        method: "GET",
      });
      if (response.status !== 200) {
        return false;
      }
      const body = (await response.json()) as {
        credential: PowerhouseVerifiableCredential;
      };
      const credential = body.credential;

      const appIdVerfied = credential.credentialSubject.id;
      const addressVerfied = credential.issuer.id.split(":")[4];
      const chainIdVerfied = credential.issuer.id.split(":")[3];

      return (
        appIdVerfied === appId &&
        addressVerfied.toLocaleLowerCase() === address.toLocaleLowerCase() &&
        chainIdVerfied === chainId.toString()
      );
    } catch {
      return false;
    }
  }
}
