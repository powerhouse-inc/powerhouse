import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type {
  IReactorClient,
  IReactorWriteClient,
  ISyncManager,
} from "@powerhousedao/reactor";
import {
  UNSIGNED_WRITE_ERROR_CODE,
  unsignedWriteMessage,
} from "@powerhousedao/shared/clis/unsigned-writes";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Minimal interface for an HTTP adapter that supports Node.js-style route handlers. */
interface NodeRouteAdapter {
  mountNodeRoute(
    method: "DELETE" | "GET" | "POST",
    path: string,
    handler: (
      req: IncomingMessage,
      res: ServerResponse,
      body?: unknown,
    ) => void | Promise<void>,
  ): void;
}
import type { RemoteDriveAllowlist } from "./admin-tools.js";
import type { McpAccess } from "./host-access.js";
import { logger } from "./logger.js";
import { createServer } from "./server.js";

/**
 * How a host that issues tokens answers a request it turns away (RFC 6750 3,
 * MCP authorization): the status, and the `WWW-Authenticate` naming where its
 * resource metadata is and the scope to ask for.
 */
export type McpChallenge = {
  status: number;
  headers: Record<string, string>;
};

/**
 * The subject the tools read as (anonymous is `{}`, never the host's signer),
 * and the label of the caller's session ("mcp claude-code"), when its
 * credential was seen.
 */
export type McpGrant = {
  subject: AuthSubject;
  access?: McpAccess;
  label?: string;
  /**
   * The answer to a call of a tool that writes documents
   * ({@link DOCUMENT_WRITE_TOOLS}) when nothing here would sign the caller's
   * writes and the host issues tokens that would: 401 for an anonymous
   * caller, 403 `insufficient_scope` for a token without `documents:write`.
   * An MCP client signs in on it. Unset, the tool runs, and the host refuses
   * what nobody signed.
   */
  writeChallenge?: McpChallenge;
};

/** An authorized request names its subject and the host ACL its tools answer to. */
export type McpAuthorizationResult =
  | ({ authorized: true } & McpGrant)
  | {
      authorized: false;
      status: number;
      message: string;
      /** A challenge's `WWW-Authenticate`, when the host issues tokens. */
      headers?: Record<string, string>;
    };

/**
 * The tools that write documents through the caller-write half: a write the
 * caller's own session (or one it delegated to the host) must sign.
 */
export const DOCUMENT_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "createDocument",
  "addActions",
  "deleteDocument",
  "addDrive",
  "deleteDrive",
]);

/** The document-writing tool a JSON-RPC message (or batch) calls, if any. */
function documentWriteCall(
  body: unknown,
): { tool: string; id: unknown } | undefined {
  for (const message of Array.isArray(body) ? body : [body]) {
    const m = message as
      | { method?: unknown; id?: unknown; params?: { name?: unknown } }
      | null
      | undefined;
    const name = m?.params?.name;
    if (
      m?.method === "tools/call" &&
      typeof name === "string" &&
      DOCUMENT_WRITE_TOOLS.has(name)
    ) {
      return { tool: name, id: m.id ?? null };
    }
  }
  return undefined;
}

/** Authorizes an /mcp request before the transport; an open endpoint opts in with `authorized: true`. */
export type McpRequestAuthorizer = (
  req: IncomingMessage,
) => Promise<McpAuthorizationResult>;

/**
 * Runs one request's tools in the host's caller-write scope, so a write signs
 * with the signer the request's caller delegated to this host (a host
 * session), or is refused when there is none.
 */
export type McpCallerWriteScope = (
  req: IncomingMessage,
  grant: McpGrant,
  run: () => Promise<void>,
) => Promise<void>;

export interface SetupMcpServerOptions {
  client: IReactorClient;
  /**
   * The write half the reactor tools and the drive tools write through: the
   * host's caller writes, which sign no action for an HTTP caller, so a write
   * tool is refused (`mcp-http-write`) and reads stay. Omitted: `client.write`.
   */
  write?: IReactorWriteClient;
  /**
   * The scope each request's tools run in, for `write`: it names the signer
   * the request's caller delegated, if any. Omitted, they run in none.
   */
  callerWrites?: McpCallerWriteScope;
  syncManager?: ISyncManager;
  authorizeRequest: McpRequestAuthorizer;
  /**
   * Whether this request's writes would be signed (its caller delegated a
   * signer to the host): its grant's write challenge is then not sent.
   */
  signsWrites?: (req: IncomingMessage, grant: McpGrant) => boolean;
  /** URLs `addRemoteDrive` may fetch; omitted, the tool is not mounted. */
  remoteDriveUrls?: RemoteDriveAllowlist;
}

function jsonRpcError(
  message: string,
  code = -32000,
  id: unknown = null,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    error: { code, message },
    id,
  });
}

const METHOD_NOT_ALLOWED = jsonRpcError("Method not allowed.");

const INTERNAL_SERVER_ERROR = jsonRpcError("Internal server error", -32603);

/** @internal Injected in tests to avoid relying on constructor mock semantics. */
type TransportFactory = (opts: {
  sessionIdGenerator: undefined;
}) => InstanceType<typeof StreamableHTTPServerTransport>;

type NodeRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body?: unknown,
) => void | Promise<void>;

type AuthorizedRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  grant: McpGrant,
) => void | Promise<void>;

/**
 * Authorizes the request before running the handler. Failures respond with
 * the authorizer's status and a JSON-RPC error; an authorizer fault fails
 * closed with a 500.
 */
function withAuthorization(
  authorize: McpRequestAuthorizer,
  handler: AuthorizedRouteHandler,
  signsWrites: SetupMcpServerOptions["signsWrites"],
): NodeRouteHandler {
  return async (req: IncomingMessage, res: ServerResponse, body?: unknown) => {
    let result: McpAuthorizationResult;
    try {
      result = await authorize(req);
    } catch (error) {
      logger.error("Error authorizing MCP request: @error", error);
      if (!res.headersSent) {
        res
          .writeHead(500, { "Content-Type": "application/json" })
          .end(INTERNAL_SERVER_ERROR);
      }
      return;
    }
    if (!result.authorized) {
      res
        .writeHead(result.status, {
          "Content-Type": "application/json",
          ...result.headers,
        })
        .end(jsonRpcError(result.message));
      return;
    }
    // A write nothing here would sign: the challenge to sign in, before any
    // tool runs, with the refusal's own words.
    const write = result.writeChallenge ? documentWriteCall(body) : undefined;
    if (
      write &&
      result.writeChallenge &&
      !(signsWrites?.(req, result) ?? false)
    ) {
      const { address } = result.subject;
      res
        .writeHead(result.writeChallenge.status, {
          "Content-Type": "application/json",
          ...result.writeChallenge.headers,
        })
        .end(
          jsonRpcError(
            `${UNSIGNED_WRITE_ERROR_CODE}: ${unsignedWriteMessage({
              reason: "mcp-http-write",
              field: write.tool,
              caller: address
                ? { address, ...(result.label ? { label: result.label } : {}) }
                : null,
              actions: [],
            })}`,
            -32001,
            write.id,
          ),
        );
      return;
    }
    await handler(req, res, body, result);
  };
}

export function setupMcpServer(
  options: SetupMcpServerOptions,
  httpAdapter: NodeRouteAdapter,
  // Allow tests to inject a factory function instead of relying on `new vi.fn()`
  // constructor semantics, which differ between macOS and Linux environments.
  createTransport: TransportFactory = (opts) =>
    new StreamableHTTPServerTransport(opts),
): Promise<void> {
  const { authorizeRequest } = options;

  httpAdapter.mountNodeRoute(
    "POST",
    "/mcp",
    withAuthorization(
      authorizeRequest,
      async (req, res, body, grant) => {
        // Stateless mode: every request owns its McpServer + transport so
        // concurrent or slow handlers cannot collide on a shared Protocol
        // instance (which throws "Already connected to a transport").
        // The tools write through `write`, which signs nothing for the caller
        // but with the signer its `callerWrites` scope names.
        const serve = async () => {
          const server = await createServer({
            client: options.client,
            ...(options.write ? { write: options.write } : {}),
            syncManager: options.syncManager,
            subject: grant.subject,
            access: grant.access,
            ...(grant.label ? { label: grant.label } : {}),
            remoteDriveUrls: options.remoteDriveUrls,
          });
          const transport = createTransport({ sessionIdGenerator: undefined });
          res.on("close", () => {
            void transport.close();
            void server.close();
          });
          await server.connect(transport);
          await transport.handleRequest(req, res, body);
        };
        try {
          await (options.callerWrites
            ? options.callerWrites(req, grant, serve)
            : serve());
        } catch (error) {
          logger.error("Error handling MCP request: @error", error);
          if (!res.headersSent) {
            res
              .writeHead(500, { "Content-Type": "application/json" })
              .end(INTERNAL_SERVER_ERROR);
          }
        }
      },
      options.signsWrites,
    ),
  );

  // GET/DELETE always answer 405 in stateless mode and reach no MCP tool, so
  // they are intentionally left unauthorized.
  httpAdapter.mountNodeRoute(
    "GET",
    "/mcp",
    (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(405).end(METHOD_NOT_ALLOWED);
    },
  );

  httpAdapter.mountNodeRoute(
    "DELETE",
    "/mcp",
    (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(405).end(METHOD_NOT_ALLOWED);
    },
  );
  return Promise.resolve();
}
