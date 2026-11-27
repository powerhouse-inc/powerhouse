import type {
  McpAccess,
  McpChallenge,
  McpGrant,
  McpRequestAuthorizer,
} from "@powerhousedao/reactor-mcp";
import { HOST_SESSION_SCOPE } from "@powerhousedao/shared/clis/host-sessions";
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
  /**
   * The host issues host session tokens (OAuth): where `/mcp`'s resource
   * metadata is for a request (RFC 9728), undefined when the host cannot
   * name its issuer for it. Its refusals then challenge the caller to sign
   * in (`WWW-Authenticate`), and so does a write nothing here would sign.
   */
  oauth?: { resourceMetadataUrl(req: IncomingMessage): string | undefined };
};

/**
 * The `WWW-Authenticate` of a challenge (RFC 6750 3, MCP authorization):
 * where the resource metadata is, the scope a write needs, and the error.
 */
function challengeHeaders(
  options: McpRequestAuthorizerOptions,
  req: IncomingMessage,
  error?: "invalid_token" | "insufficient_scope",
): Record<string, string> | undefined {
  const metadata = options.oauth?.resourceMetadataUrl(req);
  if (!metadata) return undefined;
  const params = [
    `resource_metadata="${metadata}"`,
    `scope="${HOST_SESSION_SCOPE}"`,
    ...(error ? [`error="${error}"`] : []),
  ];
  return { "WWW-Authenticate": `Bearer ${params.join(", ")}` };
}

/**
 * The challenge a caller's write gets when nothing here would sign it: an
 * anonymous caller is asked to sign in (401), a host session without
 * `documents:write` for the scope (403). A caller whose bearer is its own
 * session's gets the tool's refusal, which names its fixes.
 */
function writeChallengeFor(
  options: McpRequestAuthorizerOptions,
  req: IncomingMessage,
  user: User | undefined,
): McpChallenge | undefined {
  if (!user) {
    const headers = challengeHeaders(options, req);
    return headers ? { status: 401, headers } : undefined;
  }
  if (
    isHostSessionUser(user) &&
    !user.hostSession.scope.split(" ").includes(HOST_SESSION_SCOPE)
  ) {
    const headers = challengeHeaders(options, req, "insufficient_scope");
    return headers ? { status: 403, headers } : undefined;
  }
  return undefined;
}

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
        const headers =
          context.status === 401
            ? challengeHeaders(options, req, "invalid_token")
            : undefined;
        return {
          authorized: false,
          status: context.status,
          message: "Authentication failed",
          ...(headers ? { headers } : {}),
        };
      }
      user = context.user;
    }
    if (!user && options.requireAuthenticatedCaller) {
      const headers = challengeHeaders(options, req);
      return {
        authorized: false,
        status: 401,
        message: "Authentication required",
        ...(headers ? { headers } : {}),
      };
    }
    if (user) verifiedUsers.set(req, user);
    const writeChallenge = writeChallengeFor(options, req, user);
    return {
      authorized: true,
      subject: user ? { address: user.address, key: user.appKey } : {},
      access: hostAccess(authorizationService, options, user),
      // The session's label its credential signs ("mcp claude-code").
      ...(user?.label ? { label: user.label } : {}),
      ...(writeChallenge ? { writeChallenge } : {}),
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
