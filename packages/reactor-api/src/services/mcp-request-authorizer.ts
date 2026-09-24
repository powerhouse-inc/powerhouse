import type { McpRequestAuthorizer } from "@powerhousedao/reactor-mcp";
import type { AuthService } from "./auth.service.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "./authorization.service.js";

/**
 * Authorization gate for the /mcp endpoint (AUTH_REVIEW S-C1). MCP tools have
 * unrestricted reactor access, so access is limited to supreme admins when
 * auth is enabled. OPEN policy is public; any other policy without an
 * AuthService fails closed. The tools read as the caller: anonymous under OPEN,
 * else the admin's address and the app key its token carries.
 */
export function createMcpRequestAuthorizer(
  authService: AuthService | undefined,
  authorizationService: IAuthorizationService,
): McpRequestAuthorizer {
  return async (req) => {
    if (!authService) {
      if (authorizationService.config.policy === AuthorizationPolicy.OPEN) {
        return { authorized: true, subject: {} };
      }
      return {
        authorized: false,
        status: 401,
        message: "Authentication required",
      };
    }

    const context = await authService.verifyBearer(req.headers.authorization);
    if (context instanceof Response) {
      return {
        authorized: false,
        status: context.status,
        message: "Authentication failed",
      };
    }
    if (!context.user) {
      return {
        authorized: false,
        status: 401,
        message: "Authentication required",
      };
    }
    if (!authorizationService.isSupremeAdmin(context.user.address)) {
      return {
        authorized: false,
        status: 403,
        message: "Forbidden: MCP access requires an administrator",
      };
    }
    return {
      authorized: true,
      subject: { address: context.user.address, key: context.user.appKey },
    };
  };
}
