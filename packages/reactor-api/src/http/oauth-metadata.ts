import { HOST_SESSION_SCOPE } from "@powerhousedao/shared/clis/host-sessions";
import type { IncomingMessage } from "node:http";
import posix from "node:path/posix";
import type { IHttpAdapter } from "../graphql/gateway/types.js";

/**
 * Who issues this host's host session tokens, and the discovery documents
 * that say so: RFC 8414 (authorization server) and RFC 9728 (protected
 * resource, for GraphQL). Only what is served is listed: the device grant.
 */

export const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return (
    address === "::1" ||
    address.startsWith("127.") ||
    address.startsWith("::ffff:127.")
  );
}

/** The host's base path as an issuer's path: "" for "/", else "/base". */
export function basePathOf(basePath: string): string {
  const joined = posix.join("/", basePath);
  return joined === "/" ? "" : joined.replace(/\/+$/, "");
}

/**
 * The issuer: the configured public URL plus the base path; without one, the
 * request's own origin, but only for a request made over loopback to a
 * loopback name (a host on a network names itself by its PUBLIC_URL).
 * Undefined when it cannot be told.
 */
export function issuerOf(
  req: IncomingMessage,
  o: { publicOrigin: string | undefined; basePath: string },
): string | undefined {
  const base = basePathOf(o.basePath);
  if (o.publicOrigin) return `${o.publicOrigin.replace(/\/+$/, "")}${base}`;
  const host = req.headers.host;
  if (!host || !isLoopbackAddress(req.socket.remoteAddress)) return undefined;
  let url: URL;
  try {
    url = new URL(`http://${host}`);
  } catch {
    return undefined;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) return undefined;
  const encrypted = (req.socket as { encrypted?: boolean }).encrypted === true;
  return `${encrypted ? "https" : "http"}://${url.host}${base}`;
}

/** The OAuth endpoints under an issuer. */
export function oauthEndpoints(issuer: string) {
  return {
    deviceAuthorization: `${issuer}/oauth/device_authorization`,
    token: `${issuer}/oauth/token`,
    revocation: `${issuer}/oauth/revoke`,
    device: `${issuer}/oauth/device`,
  };
}

/** RFC 8414's document. */
export function authorizationServerMetadata(issuer: string) {
  const endpoints = oauthEndpoints(issuer);
  return {
    issuer,
    device_authorization_endpoint: endpoints.deviceAuthorization,
    token_endpoint: endpoints.token,
    revocation_endpoint: endpoints.revocation,
    grant_types_supported: [DEVICE_CODE_GRANT],
    // No authorization endpoint is served: no response type is either.
    response_types_supported: [] as string[],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [HOST_SESSION_SCOPE],
  };
}

/** RFC 9728's document for `resource`, protected by tokens of `issuer`. */
export function protectedResourceMetadata(resource: string, issuer: string) {
  return {
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: [HOST_SESSION_SCOPE],
  };
}

/**
 * Mounts both documents at the origin's root, as `/health` is, and with the
 * base path inserted (RFC 8414 3.1, RFC 9728 3.1) when there is one. The root
 * resource document is GraphQL's: the origin's.
 */
export function mountOAuthMetadata(
  adapter: Pick<IHttpAdapter, "mountNodeRoute">,
  o: { publicOrigin: string | undefined; basePath: string },
): { dispose(): void } {
  const base = basePathOf(o.basePath);
  const documents: [string, (issuer: string) => unknown][] = [
    [
      "/.well-known/oauth-authorization-server",
      (issuer) => authorizationServerMetadata(issuer),
    ],
    [
      "/.well-known/oauth-protected-resource",
      (issuer) => protectedResourceMetadata(new URL(issuer).origin, issuer),
    ],
  ];
  if (base) {
    documents.push(
      [
        `/.well-known/oauth-authorization-server${base}`,
        (issuer) => authorizationServerMetadata(issuer),
      ],
      [
        `/.well-known/oauth-protected-resource${base}`,
        (issuer) => protectedResourceMetadata(issuer, issuer),
      ],
    );
  }
  const handles = documents.map(([path, document]) =>
    adapter.mountNodeRoute("GET", path, (req, res) => {
      const issuer = issuerOf(req, o);
      const [status, body] = issuer
        ? [200, document(issuer)]
        : [
            404,
            {
              error: "not_found",
              error_description:
                "This host has no public URL (PUBLIC_URL): its OAuth metadata is served over loopback only.",
            },
          ];
      const text = JSON.stringify(body);
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.setHeader("content-length", Buffer.byteLength(text));
      res.end(text);
    }),
  );
  return {
    dispose() {
      for (const handle of handles) handle.dispose();
    },
  };
}
