import type {
  McpAccess,
  McpRequestAuthorizer,
} from "@powerhousedao/reactor-mcp";
import type { AuthService, User } from "./auth.service.js";
import type {
  CanonicalDocumentId,
  IAuthorizationService,
} from "./authorization.service.js";
import type { CanonicalDocumentIdResolver } from "./canonical-document-id.js";
import type { DocumentPermissionService } from "./document-permission.service.js";

export type McpRequestAuthorizerOptions = {
  /** GraphQL's require-authenticated-caller floor: anonymous callers get a 401. */
  requireAuthenticatedCaller: boolean;
  /** Resolves ids the way GraphQL's read checks do. */
  resolveDocumentId: CanonicalDocumentIdResolver;
  /** Records a creator as owner, as GraphQL's create mutations do. */
  documentPermissionService?: DocumentPermissionService;
};

/** The /mcp gate, as GraphQL's: a bad bearer is a 401, anonymous passes unless the
 * floor is on, and the tools answer to the caller's IAuthorizationService decisions. */
export function createMcpRequestAuthorizer(
  authService: AuthService | undefined,
  authorizationService: IAuthorizationService,
  options: McpRequestAuthorizerOptions,
): McpRequestAuthorizer {
  return async (req) => {
    let user: User | undefined;
    if (authService) {
      const context = await authService.verifyBearer(req.headers.authorization);
      if (context instanceof Response) {
        return {
          authorized: false,
          status: context.status,
          message: "Authentication failed",
        };
      }
      user = context.user;
    }
    if (!user && options.requireAuthenticatedCaller) {
      return {
        authorized: false,
        status: 401,
        message: "Authentication required",
      };
    }
    return {
      authorized: true,
      subject: user ? { address: user.address, key: user.appKey } : {},
      access: hostAccess(authorizationService, options, user?.address),
    };
  };
}

function hostAccess(
  authorization: IAuthorizationService,
  options: McpRequestAuthorizerOptions,
  address: string | undefined,
): McpAccess {
  const { resolveDocumentId, documentPermissionService } = options;
  // An id that no longer resolves is refused, as GraphQL's checks refuse it.
  const decide = async (
    identifier: string,
    check: (id: CanonicalDocumentId) => Promise<boolean>,
  ) => {
    let id: CanonicalDocumentId;
    try {
      id = await resolveDocumentId(identifier);
    } catch {
      return false;
    }
    return check(id);
  };
  return {
    unrestricted: authorization.isSupremeAdmin(address),
    authenticated: address !== undefined,
    canRead: (identifier) =>
      decide(identifier, (id) => authorization.canRead(id, address)),
    canWrite: (identifier) =>
      decide(identifier, (id) => authorization.canWrite(id, address)),
    canMutate: (identifier, operationType) =>
      decide(identifier, (id) =>
        authorization.canMutate(id, operationType, address),
      ),
    canCreate: () => authorization.canCreate(address),
    created: async (documentId) => {
      if (!address) return;
      await documentPermissionService?.initializeDocumentProtection(
        documentId,
        address,
        authorization.config.defaultProtection,
      );
    },
  };
}
