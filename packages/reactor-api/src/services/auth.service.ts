import { verifyAuthBearerToken } from "@renown/sdk";
import { type NextFunction, type Request, type Response } from "express";

export interface AuthConfig {
  enabled: boolean;
  guests: string[];
  users: string[];
  admins: string[];
  cacheTtl?: number; // Cache TTL in milliseconds, defaults to 1 hour
}

export interface User {
  address: string;
  chainId: number;
  networkId: string;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  admins: string[];
  users: string[];
  guests: string[];
}

interface CacheEntry {
  timestamp: number;
  user: User;
}

export class AuthService {
  private readonly config: AuthConfig;
  private tokenCache = new Map<string, CacheEntry>();
  private static readonly CACHE_TTL = 60 * 60 * 1000; // default to 1 hour

  constructor(config: AuthConfig) {
    this.config = config;

    // Clean up expired cache entries every 30 minutes
    setInterval(() => this.cleanupCache(), 30 * 60 * 1000);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokenCache.entries()) {
      if (
        now - entry.timestamp >
        (this.config.cacheTtl ?? AuthService.CACHE_TTL)
      ) {
        this.tokenCache.delete(token);
      }
    }
  }

  /**
   * Get cached user if token was verified recently
   */
  private getCachedUser(token: string): User | null {
    const entry = this.tokenCache.get(token);
    if (!entry) return null;

    const now = Date.now();
    if (
      now - entry.timestamp >
      (this.config.cacheTtl ?? AuthService.CACHE_TTL)
    ) {
      this.tokenCache.delete(token);
      return null;
    }

    return entry.user;
  }

  /**
   * Cache a verified token and user
   */
  private cacheToken(token: string, user: User): void {
    this.tokenCache.set(token, {
      timestamp: Date.now(),
      user,
    });
  }

  /**
   * Middleware function to authenticate requests
   */
  async authenticate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (
      !this.config.enabled ||
      req.method === "OPTIONS" ||
      req.method === "GET"
    ) {
      next();
      return;
    }

    // Set auth lists on request
    req.admins = this.config.admins;
    req.users = this.config.users;
    req.guests = this.config.guests;

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(400).json({ error: "Missing authorization token" });
      return;
    }

    try {
      const cachedUser = this.getCachedUser(token);
      if (cachedUser) {
        req.user = cachedUser;
        // Check if user is in allowed lists
        if (!this.isUserAllowed(req.user.address)) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        next();
        return;
      }

      const verified = (await this.verifyToken(token)) as {
        issuer: string;
        verifiableCredential?: {
          credentialSubject?: {
            address: string;
            chainId: number;
            networkId: string;
          };
        };
      };
      if (!verified) {
        res.status(401).json({ error: "Verification failed" });
        return;
      }

      const user = this.extractUserFromVerification(verified);
      if (!user) {
        res.status(401).json({ error: "Missing credentials" });
        return;
      }

      // Verify that the credentials still exist on the Renown API
      const credentialExists = await this.verifyCredentialExists(
        user.address,
        user.chainId,
        verified.issuer,
      );
      if (!credentialExists) {
        res.status(401).json({ error: "Credentials no longer valid" });
        return;
      }

      req.user = user;
      this.cacheToken(token, user);

      // Check if user is in allowed lists
      if (!this.isUserAllowed(user.address)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      next();
    } catch (error) {
      res.status(401).json({ error: "Authentication failed" });
    }
  }

  /**
   * Verify the auth bearer token
   */
  private async verifyToken(token: string): Promise<any> {
    return await verifyAuthBearerToken(token);
  }

  /**
   * Extract user information from verification result
   */
  private extractUserFromVerification(verified: {
    verifiableCredential?: {
      credentialSubject?: {
        address: string;
        chainId: number;
        networkId: string;
      };
    };
  }): User | null {
    if (!verified) return null;

    try {
      const { address, chainId, networkId } =
        verified.verifiableCredential?.credentialSubject || {};

      if (!address || !chainId || !networkId) {
        return null;
      }

      return {
        address: address.toLowerCase(),
        chainId,
        networkId,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if user address is in allowed lists
   */
  private isUserAllowed(address: string): boolean {
    const all = [
      ...this.config.admins,
      ...this.config.users,
      ...this.config.guests,
    ];
    return all.includes(address);
  }

  /**
   * Get additional context fields for GraphQL
   */
  getAdditionalContextFields() {
    if (!this.config.enabled) {
      return {
        isGuest: (address: string) => true,
        isUser: (address: string) => true,
        isAdmin: (address: string) => true,
      };
    }

    return {
      isGuest: (address: string) =>
        this.config.enabled &&
        this.config.guests?.includes(address.toLowerCase()),
      isUser: (address: string) =>
        this.config.enabled &&
        this.config.users?.includes(address.toLowerCase()),
      isAdmin: (address: string) =>
        this.config.enabled &&
        this.config.admins?.includes(address.toLowerCase()),
    };
  }

  /**
   * Get user context for GraphQL
   */
  getUserContext(user?: User) {
    if (!user) return {};

    return {
      user: {
        address: user.address.toLowerCase(),
        chainId: user.chainId,
        networkId: user.networkId,
      },
    };
  }

  /**
   * Verify that the credential still exists on the Renown API
   */
  private async verifyCredentialExists(
    address: string,
    chainId: number,
    connectId: string,
  ): Promise<boolean> {
    try {
      const url = `https://auth.renown.id/api/auth/credential?address=${encodeURIComponent(address)}&chainId=${chainId}&connectId=${encodeURIComponent(connectId)}`;

      const response = await fetch(url);

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as {
        credential?: {
          id?: string;
          issuer?: unknown;
          credentialSubject?: unknown;
        };
      };

      // Check if the credential exists and is valid
      return !!(
        data.credential?.id &&
        data.credential?.issuer &&
        data.credential?.credentialSubject
      );
    } catch (error) {
      // If there's any error (network, parsing, etc.), consider the credential invalid
      return false;
    }
  }
}
