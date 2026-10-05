import type { IncomingMessage, ServerResponse } from "node:http";

// A package's slice of the HTTP surface, and the webhook preset on it.
// Declared here so codegen and both host modules share one type, never two.

// `http` is optional on the host module because a browser host has no HTTP
// server. The contract stays whole: a type costs a browser bundle nothing.

/** Methods a package route may bind. OPTIONS belongs to the CORS layer. */
export type RouteMethod = "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";

// What a verified bearer resolves to, not the document model's display `User`
// nor the browser session's. `reactor-api`'s `User` extends this.
export interface RouteUser {
  address: string;
  chainId: number;
  networkId: string;
  // The did:key of the app instance that issued this token, from the verified
  // credential's issuer — the value a signer presents when it signs an action.

  // So a request decides as the principal the write path presents, not as an
  // address with no key. Authenticated: verifying resolves this very DID.
  appKey: string;
}

// The resolution the scope performs before a handler runs. `RouteContext`
// carries these two flat, rather than nesting them under one field.
export type RouteActor = {
  user: RouteUser | undefined;
  authEnabled: boolean;
};

export type AuthorizerResult =
  | { authorized: true }
  /** Refused; the scope answers with its own JSON error envelope. */
  | { authorized: false; status: number; message: string }
  // Refused with the exact response, for a protocol carrying its own error
  // shape — a JSON-RPC endpoint answers with a JSON-RPC error object.

  // Without it such an endpoint must declare itself `public` and gate inside
  // the handler, hiding it from an inventory of unauthenticated routes.
  | { authorized: false; response: Response };

/** A route-specific gate, for policies the standard modes cannot express. */
export type RouteAuthorizer = (
  req: IncomingMessage,
) => Promise<AuthorizerResult> | AuthorizerResult;

/** How a route authenticates. */
export type RouteAuth =
  /** Default. A verifiable bearer is required; a caller without one gets 401. */
  | "renown"
  // Verified if present; absence yields an anonymous actor, not a 401. For
  // handlers making their own per-document authorization decision.
  | "renown-optional"
  // No identity is checked. Written out explicitly so grepping for it lists
  // every unauthenticated route in the fleet.
  | "public"
  | RouteAuthorizer;

/** How the request body reaches the handler. */
export type RouteBody =
  /** Default. Buffered, and readable through the Fetch Request. */
  | "parsed"
  /** Buffered and also handed over as `ctx.rawBody`, byte for byte. */
  | "raw"
  /** Not buffered; the Fetch Request body is the live request stream. */
  | "stream"
  /** The body is not read at all. */
  | "none";

export interface RouteOptions {
  auth?: RouteAuth;
  body?: RouteBody;
  /** Refuse a body larger than this with 413. Ignored when body is `stream`. */
  maxBodyBytes?: number;
  /** Serve sub-paths too, not just an exact match. */
  prefix?: boolean;
}

/** Where the request reached the host, resolved through any reverse proxy. */
export interface RouteTransport {
  proto: string;
  host: string;
  prefix: string;
  baseUrl: string;
}

export interface RouteContext {
  /** Decoded path params. */
  params: Record<string, string>;
  // Spelled as a subgraph resolver's `ctx.user`, so a package author writes the
  // same expression on both surfaces. Undefined when nobody was verified.
  user: RouteUser | undefined;
  // Whether this request's identity was checked. False on a `public` route, a
  // custom authorizer, or a host running with authentication disabled.
  authEnabled: boolean;
  /** The exact octets received. Present only when body is `raw`. */
  rawBody: Buffer | undefined;
  /** Aborts when the client disconnects. */
  signal: AbortSignal;
  transport: RouteTransport;
}

export type RouteHandler = (
  request: Request,
  ctx: RouteContext,
) => Response | Promise<Response>;

export interface RouteSpec extends RouteOptions {
  method: RouteMethod | RouteMethod[];
  /** Relative to the scope: "runs/:id", never "/api/@scope/pkg/runs/:id". */
  path: string;
  handler: RouteHandler;
}

// `body` and `maxBodyBytes` are absent because a node route reads the stream
// itself: a cap declared here would be silently inert.
export interface NodeRouteSpec extends Omit<
  RouteOptions,
  "body" | "maxBodyBytes"
> {
  method: RouteMethod | RouteMethod[];
  path: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: Omit<RouteContext, "rawBody" | "signal">,
  ) => void | Promise<void>;
}

// Handle to a registered route. Packages hot-reload, so registration is
// reversible and disposing a route that is already gone is a no-op.
export interface ScopedRouteHandle {
  /** The absolute public URL this route answers on. */
  readonly url: string;
  dispose(): void;
}

// ── webhooks ───────────────────────────────────────────────────────────────

// The signature's layout in the header, named by wire format rather than by
// sender: a brand name fits one sender and misleads about the rest.

// Separate from `algorithm` and `encoding`, which a sender picks independently
// of how it frames the result; folding them in needs a name per combination.
export type WebhookScheme =
  | "none"
  /** A shared secret presented verbatim. No digest, so no digest options. */
  | "token"
  /** The digest of the body, alone. */
  | "hmac"
  /** That digest behind a label, `sha256=<digest>`. */
  | "hmac-prefixed"
  // `t=<unix>,v1=<digest>`, digest over `<unix>.<body>`, so a captured request
  // expires. Any one of several rotating `v1` values matching is a pass.
  | "hmac-timestamped";

/** Hashes a sender may compute the digest with. */
export type WebhookHashAlgorithm = "sha1" | "sha256" | "sha512";

/** How the digest is written into the header. */
export type WebhookSignatureEncoding = "hex" | "base64";

export interface WebhookVerification {
  scheme: WebhookScheme;
  /** Resolved value, never a reference — the caller resolves refs. */
  secret?: string;
  /** Overrides the scheme's conventional header. */
  header?: string;
  /** Replay window for timestamped schemes. */
  toleranceSeconds?: number;
  // Hash behind the HMAC, default `sha256`. `sha1` is for senders that chose
  // earlier and still sign that way.
  algorithm?: WebhookHashAlgorithm;
  /** Defaults to `hex`. Base64 comparison is case-sensitive; hex is not. */
  encoding?: WebhookSignatureEncoding;
  // The label `hmac-prefixed` expects before the digest, default
  // `<algorithm>=`. Set `""` for this layout with no label at all.

  // Ignored by the others: `hmac` has nothing before the digest, and
  // `hmac-timestamped`'s `v1=` is structural rather than a label.
  prefix?: string;
}

// Where to read a value a sender sent. A bare string is a query parameter or a
// top-level body field, which is where an event id usually is.

// The other forms exist because senders disagree: top-level-only left
// header-borne and nested ids unreachable, forcing the wrong dedupe key.
export type WebhookField =
  | string
  | { header: string }
  /** Dot-separated path into the parsed body, e.g. `data.object.id`. */
  | { body: string };

export interface WebhookRequest {
  /** The caller's own key for this endpoint, e.g. a document id. */
  key: string;
  method: string;
  path: string;
  queryParams: Record<string, string>;
  /** Lowercased, with credentials redacted. */
  headers: Record<string, string>;
  /** The exact bytes received. */
  raw: Buffer;
  /** JSON and form bodies decoded; anything else as text. */
  body: unknown;
}

export interface WebhookReply {
  status: number;
  body?: string;
  contentType?: string;
}

// What core enforces for one endpoint before the handler sees a delivery.

// Resolved per endpoint because this is document configuration: one package
// registers once, each endpoint has its own secret, dedupe field and methods.
export interface WebhookPolicy {
  verify?: WebhookVerification;
  /** Uppercase. Undefined accepts every method. */
  methods?: string[];
  // A field naming the sender's own delivery id. Every sender redelivers, so
  // this is how a retry is recognised rather than replayed.
  dedupe?: { field: WebhookField; ttlSeconds?: number };
  // A field a sender echoes back to prove the endpoint exists before it will
  // register it. Answered without invoking onRequest.
  challengeField?: WebhookField;
  maxBodyBytes?: number;
}

// One endpoint family a package registers. Deliberately does not extend
// `WebhookPolicy`: the shape has to say which level a field belongs to.

// Settable at both, a value meant for one endpoint would compile, read
// correctly, and quietly apply to the whole family.
export interface WebhookSpec {
  /** Distinguishes several endpoint families within one package. */
  name: string;
  // What a per-endpoint policy merges over: fixed properties of the
  // integration. Anything an author can change belongs in `policyFor`.
  defaults?: WebhookPolicy;
  onRequest: (request: WebhookRequest) => Promise<WebhookReply> | WebhookReply;
  // The policy for one endpoint, merged over the registration's. Undefined
  // means not armed, which answers exactly as an unknown token does.

  // A prober must not be able to tell a disarmed endpoint from one that
  // never existed.
  policyFor?: (
    key: string,
  ) => Promise<WebhookPolicy | undefined> | WebhookPolicy | undefined;
}

export interface WebhookEndpointInfo {
  key: string;
  token: string;
  url: string;
  createdAt: string;
}

export interface IWebhookEndpoints {
  // The endpoint for a key. The caller owns the key, the service owns the
  // token: "never the document id in the URL" is structural, not a rule.
  endpointFor(key: string): Promise<Omit<WebhookEndpointInfo, "key">>;
  revoke(key: string): Promise<void>;
  list(): Promise<WebhookEndpointInfo[]>;
}

export interface IWebhookScope {
  register(spec: WebhookSpec): Promise<IWebhookEndpoints>;
  // Whether the host knows its own public origin, and so whether
  // `endpointFor().url` is absolute rather than a bare path.

  // A package hands that URL to a third party, which rejects a path. Worth
  // surfacing as a misconfiguration, not finding in a provider's error log.
  readonly hasPublicOrigin: boolean;
}

// ── the scope ──────────────────────────────────────────────────────────────

// Handed to the package already bound to its own namespace: no unscoped
// registrar to reach, and no way to express an absolute path.
export interface IHttpScope {
  // Whose scope it is: a package's npm name, or the host's name for one of its
  // own route groups.

  // An identity, never a URL fragment — take paths from `baseUrl`, since a
  // host scope's owner does not appear in the path at all.
  readonly owner: string;
  // Absolute public base every route hangs off, e.g.
  // `https://host/api/@scope/pkg`. A path only when the origin is unknown.
  readonly baseUrl: string;

  get(path: string, handler: RouteHandler): ScopedRouteHandle;
  get(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  post(path: string, handler: RouteHandler): ScopedRouteHandle;
  post(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  put(path: string, handler: RouteHandler): ScopedRouteHandle;
  put(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  patch(path: string, handler: RouteHandler): ScopedRouteHandle;
  patch(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  delete(path: string, handler: RouteHandler): ScopedRouteHandle;
  delete(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;
  /** Registered independently of GET: a HEAD response is not a bodyless GET. */
  head(path: string, handler: RouteHandler): ScopedRouteHandle;
  head(
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): ScopedRouteHandle;

  route(spec: RouteSpec): ScopedRouteHandle;

  // For protocols that must own the socket. Still inside the namespace, so
  // the escape hatch does not escape the prefix.

  // The request arrives unread and byte-exact, so a handler may verify a
  // signature over the octets or hand the stream to a protocol that reads it.
  nodeRoute(spec: NodeRouteSpec): ScopedRouteHandle;

  // A different kind of surface: the URL is the credential, the bytes are
  // load-bearing, and senders probe before they register.
  readonly webhooks: IWebhookScope;

  /** Release every route this scope registered. Called on package teardown. */
  dispose(): void;
}
