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
  cacheTtl?: number; // Cache TTL in milliseconds, defaults to 10 seconds
  skipCredentialVerification?: boolean; // Skip Renown API credential verification (useful for testing)
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
    const token = request.headers.get("authorization")?.split(" ")[1];
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
   * Get additional context fields for GraphQL
   */
  getAdditionalContextFields() {
    if (!this.config.enabled) {
      return {
        isAdmin: () => true,
      };
    }

    return {
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
    appId: string,
  ): Promise<boolean> {
    const url = `https://www.renown.id/api/auth/credential?address=${address}&chainId=${chainId}&connectId=${appId}&appId=${appId}`;
    try {
      const response = await fetch(url, {
        method: "GET",
      });
      const body = (await response.json()) as {
        credential: PowerhouseVerifiableCredential;
      };
      const credential = body.credential;

      const appIdVerfied = credential.credentialSubject.id;
      const addressVerfied = credential.issuer.id.split(":")[4];
      const chainIdVerfied = credential.issuer.id.split(":")[3];

      if (response.status !== 200) {
        return false;
      }

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
