import type {
  McpAccess,
  McpGrant,
  McpRequestAuthorizer,
} from "@powerhousedao/reactor-mcp";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { AuthService, User } from "./auth.service.js";
import type {
  CanonicalDocumentId,
  IAuthorizationService,
} from "./authorization.service.js";
import type { CanonicalDocumentIdResolver } from "./canonical-document-id.js";
import type { DocumentPermissionService } from "./document-permission.service.js";
import { isHostSessionUser, runAsCaller } from "./host-session-scope.js";

export type McpRequestAuthorizerOptions = {
  /** GraphQL's require-authenticated-caller floor: anonymous callers get a 401. */
  requireAuthenticatedCaller: boolean;
  /** Resolves ids the way GraphQL's read checks do. */
  resolveDocumentId: CanonicalDocumentIdResolver;
  /** Records a creator as owner, as GraphQL's create mutations do. */
  documentPermissionService?: DocumentPermissionService;
};

/** The user each authorized `/mcp` request's bearer named, for its caller context. */
const verifiedUsers = new WeakMap<IncomingMessage, User>();

/** The /mcp gate, as GraphQL's: a bad bearer is a 401, anonymous passes unless the
 * floor is on, and the tools answer to the caller's IAuthorizationService decisions.
 * It takes a host session token, whose tools have no policy-wide access and
 * administer nothing. */
export function createMcpRequestAuthorizer(
  authService: AuthService | undefined,
  authorizationService: IAuthorizationService,
  options: McpRequestAuthorizerOptions,
): McpRequestAuthorizer {
  return async (req) => {
    let user: User | undefined;
    if (authService) {
      const context = await authService.verifyBearer(
        req.headers.authorization,
        { hostSessions: true },
      );
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
    if (user) verifiedUsers.set(req, user);
    return {
      authorized: true,
      subject: user ? { address: user.address, key: user.appKey } : {},
      access: hostAccess(authorizationService, options, user),
      // The session's label its credential signs ("mcp claude-code").
      ...(user?.label ? { label: user.label } : {}),
    };
  };
}

/**
 * What a host's `delegatedSigner` reads for an HTTP `/mcp` request: the
 * request's headers and the user its bearer named, as on the GraphQL context
 * (`via` and `hostSession` included, for a host session token).
 */
export type McpCallerContext = {
  headers: IncomingHttpHeaders;
  user?: Pick<User, "address"> & Partial<User>;
};

/** The context `delegatedSigner` gets for an authorized `/mcp` request. */
export function mcpCallerContext(
  req: IncomingMessage,
  grant: McpGrant,
): McpCallerContext {
  const verified = verifiedUsers.get(req);
  if (verified) return { headers: req.headers, user: verified };
  const { address, key } = grant.subject;
  return {
    headers: req.headers,
    ...(address
      ? {
          user: {
            address,
            ...(key ? { appKey: key } : {}),
            ...(grant.label ? { label: grant.label } : {}),
          },
        }
      : {}),
  };
}

function hostAccess(
  authorization: IAuthorizationService,
  options: McpRequestAuthorizerOptions,
  user: User | undefined,
): McpAccess {
  const { resolveDocumentId, documentPermissionService } = options;
  const address = user?.address;
  // Every decision as the caller: a host session's in its scope.
  const asCaller = <T>(run: () => T): T => runAsCaller(user, run, "/mcp");
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
    return asCaller(() => check(id));
  };
  const hostSession = isHostSessionUser(user);
  return {
    unrestricted: !hostSession && authorization.isSupremeAdmin(address),
    operator: asCaller(() => authorization.isOperator(address)),
    authenticated: address !== undefined,
    canRead: (identifier) =>
      decide(identifier, (id) => authorization.canRead(id, address)),
    canWrite: (identifier) =>
      decide(identifier, (id) => authorization.canWrite(id, address)),
    canMutate: (identifier, operationType) =>
      decide(identifier, (id) =>
        authorization.canMutate(id, operationType, address),
      ),
    canCreate: () => asCaller(() => authorization.canCreate(address)),
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
