import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { AuthContext, AuthService } from "../src/services/auth.service.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";
import { createMcpRequestAuthorizer } from "../src/services/mcp-request-authorizer.js";

// Unit tests for the /mcp authorization gate (AUTH_REVIEW S-C1).

const makeRequest = (authorization?: string): IncomingMessage =>
  ({ headers: { authorization } }) as IncomingMessage;

const makeAuthorizationService = (
  policy: AuthorizationPolicy,
  isSupremeAdmin: boolean,
): IAuthorizationService =>
  ({
    config: { admins: [], defaultProtection: false, policy },
    isSupremeAdmin: vi.fn().mockReturnValue(isSupremeAdmin),
  }) as unknown as IAuthorizationService;

const makeAuthService = (result: AuthContext | Response): AuthService =>
  ({
    verifyBearer: vi.fn().mockResolvedValue(result),
  }) as unknown as AuthService;

const user = { address: "0xadmin", chainId: 1, networkId: "eip155" };

describe("createMcpRequestAuthorizer", () => {
  it("allows every request when auth is disabled and the policy is OPEN", async () => {
    const authorize = createMcpRequestAuthorizer(
      undefined,
      makeAuthorizationService(AuthorizationPolicy.OPEN, true),
    );

    await expect(authorize(makeRequest())).resolves.toEqual({
      authorized: true,
    });
  });

  it("fails closed when no auth service exists under a non-OPEN policy", async () => {
    const authorize = createMcpRequestAuthorizer(
      undefined,
      makeAuthorizationService(AuthorizationPolicy.ADMIN_ONLY, true),
    );

    const result = await authorize(makeRequest("Bearer token"));

    expect(result).toEqual({
      authorized: false,
      status: 401,
      message: "Authentication required",
    });
  });

  it("propagates the status of a failed token verification", async () => {
    const authorize = createMcpRequestAuthorizer(
      makeAuthService(new Response("nope", { status: 401 })),
      makeAuthorizationService(AuthorizationPolicy.DOCUMENT_PERMISSIONS, true),
    );

    const result = await authorize(makeRequest("Bearer bad-token"));

    expect(result).toEqual({
      authorized: false,
      status: 401,
      message: "Authentication failed",
    });
  });

  it("rejects anonymous requests (no token) with a 401", async () => {
    const authorize = createMcpRequestAuthorizer(
      makeAuthService({ user: undefined, admins: [], auth_enabled: true }),
      makeAuthorizationService(AuthorizationPolicy.DOCUMENT_PERMISSIONS, true),
    );

    const result = await authorize(makeRequest());

    expect(result).toEqual({
      authorized: false,
      status: 401,
      message: "Authentication required",
    });
  });

  it("rejects authenticated non-admins with a 403", async () => {
    const authorizationService = makeAuthorizationService(
      AuthorizationPolicy.DOCUMENT_PERMISSIONS,
      false,
    );
    const authorize = createMcpRequestAuthorizer(
      makeAuthService({ user, admins: [], auth_enabled: true }),
      authorizationService,
    );

    const result = await authorize(makeRequest("Bearer token"));

    expect(result).toEqual({
      authorized: false,
      status: 403,
      message: "Forbidden: MCP access requires an administrator",
    });
    expect(authorizationService.isSupremeAdmin).toHaveBeenCalledWith(
      user.address,
    );
  });

  it("allows authenticated supreme admins", async () => {
    const authService = makeAuthService({
      user,
      admins: [user.address],
      auth_enabled: true,
    });
    const authorize = createMcpRequestAuthorizer(
      authService,
      makeAuthorizationService(AuthorizationPolicy.DOCUMENT_PERMISSIONS, true),
    );

    const result = await authorize(makeRequest("Bearer token"));

    expect(result).toEqual({ authorized: true });
    expect(authService.verifyBearer).toHaveBeenCalledWith("Bearer token");
  });
});
