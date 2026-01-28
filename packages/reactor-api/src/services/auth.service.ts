import {
  verifyAuthBearerToken,
  type AuthVerifiedCredential,
  type PowerhouseVerifiableCredential,
} from "@renown/sdk";
import type { NextFunction, Request, Response } from "express";

export interface AuthConfig {
  enabled: boolean;
  guests: string[];
  users: string[];
  admins: string[];
  freeEntry: boolean;
  cacheTtl?: number; // Cache TTL in milliseconds, defaults to 10 seconds
  skipCredentialVerification?: boolean; // Skip Renown API credential verification (useful for testing)
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
  freeEntry: boolean;
}

interface CacheEntry {
  timestamp: number;
  user: User;
}

export class AuthService {
  private readonly config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
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
    req.auth_enabled = this.config.enabled;
    req.freeEntry = this.config.freeEntry;
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(400).json({ error: "Missing authorization token" });
      return;
    }

    try {
      const verified = await this.verifyToken(token);

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
      // This can be skipped via config (useful for testing or when Renown API is unavailable)
      if (!this.config.skipCredentialVerification) {
        const credentialExists = await this.verifyCredentialExists(
          user.address,
          user.chainId,
          verified.issuer,
        );
        if (!credentialExists) {
          res.status(401).json({ error: "Credentials no longer valid" });
          return;
        }
      }

      req.user = user;

      // Note: We no longer block users here based on global allowed lists.
      // The resolver layer handles authorization based on:
      // 1. Global roles (admin/user/guest) for unrestricted access
      // 2. Document-level permissions (direct or via groups) for specific documents
      // This allows users who have document-specific permissions (e.g., via groups)
      // to access those documents even if they're not in the global allowed lists.

      next();
    } catch {
      res.status(401).json({ error: "Authentication failed" });
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
    verified.verifiableCredential["@context"];
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
    verified: AuthVerifiedCredential,
  ): User | null {
    if (!verified) return null;
    try {
      const { address, chainId, networkId } =
        verified.verifiableCredential?.credentialSubject || {};

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
   * Check if user address is in allowed lists
   */
  private isUserAllowed(address: string): boolean {
    const all = [
      ...this.config.admins,
      ...this.config.users,
      ...this.config.guests,
    ];
    return all.includes(address.toLocaleLowerCase()) || this.config.freeEntry;
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
        (this.config.freeEntry ||
          this.config.guests?.includes(address.toLowerCase())),
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
    const url = `https://www.renown.id/api/auth/credential?address=${address}&chainId=${chainId}&connectId=${connectId}`;
    try {
      const response = await fetch(url, {
        method: "GET",
      });
      const body = (await response.json()) as {
        credential: PowerhouseVerifiableCredential;
      };
      const credential = body.credential;

      const connectIdVerfied = credential.credentialSubject.id;
      const addressVerfied = credential.issuer.id.split(":")[4];
      const chainIdVerfied = credential.issuer.id.split(":")[3];

      if (response.status !== 200) {
        return false;
      }

      return (
        connectIdVerfied === connectId &&
        addressVerfied.toLocaleLowerCase() === address.toLocaleLowerCase() &&
        chainIdVerfied === chainId.toString()
      );
    } catch {
      return false;
    }
  }
}
