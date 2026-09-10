import { childLogger } from "document-model";
import type { IncomingMessage, ServerResponse } from "node:http";
import posix from "node:path/posix";
import { Readable } from "node:stream";
import type {
  AdapterRouteHandle as AdapterHandle,
  IHttpAdapter,
} from "../graphql/gateway/types.js";
import type { AuthService } from "../services/auth.service.js";
import type { WebhookService } from "./webhook-service.js";
import {
  assertHostMountPath,
  assertRelativeRoutePath,
  encodedNamespacePath,
  InvalidNamespaceError,
  namespacePath,
  resolvePackageName,
} from "./namespace.js";
import {
  BodyTooLargeError,
  fetchHeaders,
  readBody,
  resolveTransport,
  writeError,
  writeResponse,
} from "./node-response.js";
import type {
  IHttpScope,
  IWebhookScope,
  NodeRouteSpec,
  RouteActor,
  RouteAuth,
  RouteContext,
  ScopedRouteHandle,
  RouteHandler,
  RouteMethod,
  RouteOptions,
  RouteSpec,
} from "./types.js";

const logger = childLogger(["reactor-api", "http-routes"]);

/** The segment package routes live under, inside the host's base path. */
export const PACKAGE_ROUTE_SEGMENT = "api";

/** The namespace core's own subgraphs and services register under. */
export const CORE_PACKAGE_NAME = "@powerhousedao/reactor-api";

/** Generous enough for any request a route should be buffering at all. */
const DEFAULT_MAX_BODY_BYTES = 1_048_576;

const ANONYMOUS: RouteActor = { user: undefined, authEnabled: false };

export interface HttpRouteServiceOptions {
  httpAdapter: IHttpAdapter;
  /** Absent on a host with no webhook store; `scope.webhooks` then refuses. */
  webhooks?: WebhookService;
  /** The host's base path, i.e. config.basePath. */
  basePath?: string;
  /** Absent when auth is disabled host-wide; every route then sees an anonymous actor. */
  authService?: AuthService;
  /** The host's public origin; empty when unknowable, the only case where advertised URLs degrade to paths. */
  publicUrl?: string;
  /** Whether to believe the `X-Forwarded-*` headers that name the request's public origin.
   * Off by default: they are client-written, so with no proxy in front a caller could choose the origin a route advertises. */
  trustProxy?: boolean;
}

type Registration = { path: string; handles: AdapterHandle[] };

/** Owns the URL space packages serve from, handing each a scope bound to its own namespace. The prefix nests inside
 * the host's base path (`<basePath>/api`), so core collisions are prevented by URL shape, not a reserved-name list. */
export class HttpRouteService {
  readonly #adapter: IHttpAdapter;
  readonly #authService: AuthService | undefined;
  readonly #prefix: string;
  readonly #publicUrl: string;
  readonly #trustProxy: boolean;
  readonly #scopes = new Map<string, HttpScope>();

  readonly #webhooks: WebhookService | undefined;

  constructor({
    httpAdapter,
    basePath = "/",
    authService,
    webhooks,
    publicUrl = "",
    trustProxy = false,
  }: HttpRouteServiceOptions) {
    this.#adapter = httpAdapter;
    this.#authService = authService;
    this.#webhooks = webhooks;
    this.#publicUrl = publicUrl.replace(/\/+$/, "");
    this.#trustProxy = trustProxy;
    this.#prefix = posix.join("/", basePath, PACKAGE_ROUTE_SEGMENT);
  }

  /** The absolute path packages are mounted under. */
  get prefix(): string {
    return this.#prefix;
  }

  /** The scope for a package; idempotent per name, so a reload cannot accumulate namespaces. Throws when two packages
   * resolve to one namespace — with verbatim names that means one package configured twice, a genuine ambiguity. */
  scopeFor(packageKey: string): IHttpScope {
    const packageName = resolvePackageName(packageKey);
    const namespace = namespacePath(packageName);
    const encoded = encodedNamespacePath(packageName);
    return this.#scope({
      owner: packageName,
      base: posix.join(this.#prefix, namespace),
      encodedBase: encoded ? posix.join(this.#prefix, encoded) : undefined,
      claim: `the route namespace "${namespace}"`,
      webhooks: this.#webhooks?.scopeFor(packageName),
      onDispose: () => this.#webhooks?.disposeScope(packageName),
    });
  }

  /** A scope at a host-named path; on the service, not `IHttpScope`, so a package can never name one. Namespacing is package
   * policy: the host owns its URL space and third parties hold its URLs, so the path is verbatim and outside the package prefix. */
  hostScope(name: string, mountPath: string): IHttpScope {
    const base = assertHostMountPath(mountPath);
    if (base === this.#prefix || base.startsWith(`${this.#prefix}/`)) {
      throw new InvalidNamespaceError(
        `Host scope "${name}" cannot mount at "${base}": that is the package route prefix, which packages own`,
      );
    }
    return this.#scope({
      owner: name,
      base,
      encodedBase: undefined,
      claim: `the mount path "${base}"`,
      // None of its own: a token-addressed endpoint belongs to whoever minted the token, always a package.
      webhooks: undefined,
      onDispose: () => undefined,
    });
  }

  /** Idempotent per base path, so a package reload cannot accumulate namespaces. Two owners wanting one path is an error —
   * with verbatim names that needs one package configured twice at different versions, a genuine ambiguity, not a clash. */
  #scope(options: {
    owner: string;
    base: string;
    encodedBase: string | undefined;
    claim: string;
    webhooks: IWebhookScope | undefined;
    onDispose: () => void;
  }): IHttpScope {
    const { owner, base } = options;
    const existing = this.#scopes.get(base);
    if (existing) {
      if (existing.owner !== owner) {
        throw new Error(
          `"${owner}" wants ${options.claim}, which "${existing.owner}" already holds`,
        );
      }
      return existing;
    }

    const scope = new HttpScope({
      owner,
      base,
      encodedBase: options.encodedBase,
      publicUrl: this.#publicUrl,
      trustProxy: this.#trustProxy,
      adapter: this.#adapter,
      authService: this.#authService,
      webhooks: options.webhooks,
      onDispose: () => {
        this.#scopes.delete(base);
        options.onDispose();
      },
    });
    this.#scopes.set(base, scope);
    return scope;
  }

  /** Like {@link scopeFor}, but never throws: a key resolving to no usable npm name gets a scope that refuses
   * registrations, so one unroutable package cannot stop the host booting — it fails only if it serves a route. */
  scopeForOrNull(packageKey: string): IHttpScope {
    try {
      return this.scopeFor(packageKey);
    } catch (error) {
      if (!(error instanceof InvalidNamespaceError)) throw error;
      // Scoped package names carry a leading `@`, which the logger reads as
      // a replacement token: pass them positionally so the name survives.
      logger.warn(
        'Package "@package" cannot host HTTP routes: @reason',
        packageKey,
        error.message,
      );
      return new UnroutableScope(packageKey, error.message);
    }
  }

  /** Releases a package's routes, e.g. when it is replaced or removed. */
  disposeScope(packageKey: string): void {
    try {
      const namespace = namespacePath(resolvePackageName(packageKey));
      this.#scopes.get(posix.join(this.#prefix, namespace))?.dispose();
    } catch (error) {
      if (!(error instanceof InvalidNamespaceError)) throw error;
    }
  }

  disposeAll(): void {
    for (const scope of [...this.#scopes.values()]) scope.dispose();
  }
}

interface HttpScopeOptions {
  /** A package's npm name, or the host's name for one of its route groups. */
  owner: string;
  /** Absolute path every route in the scope hangs off. */
  base: string;
  /** The same base with a scoped name's `@` percent-encoded, when it has one. */
  encodedBase: string | undefined;
  publicUrl: string;
  trustProxy: boolean;
  adapter: IHttpAdapter;
  authService: AuthService | undefined;
  webhooks: IWebhookScope | undefined;
  onDispose: () => void;
}

class HttpScope implements IHttpScope {
  readonly owner: string;
  readonly #base: string;
  readonly #publicUrl: string;
  readonly #trustProxy: boolean;
  readonly #encodedBase: string | undefined;
  readonly #adapter: IHttpAdapter;
  readonly #authService: AuthService | undefined;
  readonly #onDispose: () => void;
  readonly #registrations = new Map<string, Registration>();
  readonly #webhooks: IWebhookScope;

  constructor(options: HttpScopeOptions) {
    this.owner = options.owner;
    this.#base = options.base;
    this.#publicUrl = options.publicUrl;
    this.#trustProxy = options.trustProxy;
    this.#encodedBase = options.encodedBase;
    this.#adapter = options.adapter;
    this.#authService = options.authService;
    this.#onDispose = options.onDispose;
    this.#webhooks = options.webhooks ?? unavailableWebhooks(options.owner);
  }

  get baseUrl(): string {
    return `${this.#publicUrl}${this.#base}`;
  }

  get webhooks(): IWebhookScope {
    return this.#webhooks;
  }

  get(path: string, a: RouteOptions | RouteHandler, b?: RouteHandler) {
    return this.#shorthand("GET", path, a, b);
  }
  post(path: string, a: RouteOptions | RouteHandler, b?: RouteHandler) {
    return this.#shorthand("POST", path, a, b);
  }
  put(path: string, a: RouteOptions | RouteHandler, b?: RouteHandler) {
    return this.#shorthand("PUT", path, a, b);
  }
  patch(path: string, a: RouteOptions | RouteHandler, b?: RouteHandler) {
    return this.#shorthand("PATCH", path, a, b);
  }
  delete(path: string, a: RouteOptions | RouteHandler, b?: RouteHandler) {
    return this.#shorthand("DELETE", path, a, b);
  }
  head(path: string, a: RouteOptions | RouteHandler, b?: RouteHandler) {
    return this.#shorthand("HEAD", path, a, b);
  }

  #shorthand(
    method: RouteMethod,
    path: string,
    a: RouteOptions | RouteHandler,
    b?: RouteHandler,
  ): ScopedRouteHandle {
    const options = typeof a === "function" ? {} : a;
    const handler = typeof a === "function" ? a : b;
    if (!handler) {
      throw new Error(`Route ${method} ${path} was registered with no handler`);
    }
    return this.route({ ...options, method, path, handler });
  }

  route(spec: RouteSpec): ScopedRouteHandle {
    const body = spec.body ?? "parsed";
    return this.#register(spec, (req, res, ctx) =>
      this.#serve(spec, body, req, res, ctx),
    );
  }

  nodeRoute(spec: NodeRouteSpec): ScopedRouteHandle {
    return this.#register(spec, (req, res, ctx) => spec.handler(req, res, ctx));
  }

  dispose(): void {
    for (const registration of this.#registrations.values()) {
      for (const handle of registration.handles) handle.dispose();
    }
    this.#registrations.clear();
    this.#onDispose();
  }

  /** Mounts one route under this scope's namespace, in both the verbatim and the
   * percent-encoded spelling of a scoped name. */
  #register(
    spec: {
      method: RouteMethod | RouteMethod[];
      path: string;
      auth?: RouteAuth;
      maxBodyBytes?: number;
      prefix?: boolean;
    },
    run: (
      req: IncomingMessage,
      res: ServerResponse,
      ctx: Omit<RouteContext, "rawBody" | "signal">,
    ) => void | Promise<void>,
  ): ScopedRouteHandle {
    const relative = assertRelativeRoutePath(spec.path);
    const methods = Array.isArray(spec.method) ? spec.method : [spec.method];
    const routePath = relative ? posix.join(this.#base, relative) : this.#base;

    const key = `${methods.join(",")} ${routePath}`;
    if (this.#registrations.has(key)) {
      // Silent shadowing is how a route disappears without anyone noticing;
      // for a security-relevant surface that has to be loud.
      throw new Error(`Route ${key} is already registered by "${this.owner}"`);
    }

    const handles: AdapterHandle[] = [];
    const paths = [routePath];
    if (this.#encodedBase) {
      paths.push(
        relative ? posix.join(this.#encodedBase, relative) : this.#encodedBase,
      );
    }

    for (const path of paths) {
      for (const method of methods) {
        handles.push(
          this.#adapter.mountNodeRoute(
            method,
            path,
            (req, res) => {
              void this.#guard(spec, req, res, run);
            },
            // The service owns body handling for every route it registers, so
            // it always takes the unparsed stream from the adapter.
            { rawBody: true, prefix: spec.prefix },
          ),
        );
      }
    }

    this.#registrations.set(key, { path: routePath, handles });
    logger.debug("Registered @route for @package", key, this.owner);

    return {
      url: `${this.#publicUrl}${routePath}`,
      dispose: () => {
        const registration = this.#registrations.get(key);
        if (!registration) return;
        for (const handle of registration.handles) handle.dispose();
        this.#registrations.delete(key);
      },
    };
  }

  /** Authenticate, then run. */
  async #guard(
    spec: { auth?: RouteAuth },
    req: IncomingMessage,
    res: ServerResponse,
    run: (
      req: IncomingMessage,
      res: ServerResponse,
      ctx: Omit<RouteContext, "rawBody" | "signal">,
    ) => void | Promise<void>,
  ): Promise<void> {
    try {
      const actor = await this.#authenticate(spec.auth ?? "renown", req, res);
      if (actor === REJECTED) return;

      await run(req, res, {
        params: routeParams(req),
        user: actor?.user,
        authEnabled: actor?.authEnabled ?? false,
        transport: resolveTransport(req, this.#trustProxy),
      });
    } catch (error) {
      logger.error(
        "Route handler failed for @package",
        this.owner,
        error as Error,
      );
      writeError(res, 500, "Internal server error");
    }
  }

  /** Resolves the caller, answering the request itself when the route refuses it;
   * returns REJECTED in that case so the caller stops. */
  async #authenticate(
    auth: RouteAuth,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<RouteActor | undefined | typeof REJECTED> {
    if (auth === "public") return undefined;

    if (typeof auth === "function") {
      const result = await auth(req);
      if (!result.authorized) {
        if ("response" in result) {
          await writeResponse(res, result.response, req.method ?? "GET");
        } else {
          writeError(res, result.status, result.message);
        }
        return REJECTED;
      }
      return undefined;
    }

    // No auth service means auth is disabled host-wide: every caller is the
    // anonymous actor, which is the only way to opt out of bearer checking.
    if (!this.#authService) return ANONYMOUS;

    const result = await this.#authService.verifyBearer(
      req.headers.authorization,
    );

    if (result instanceof Response) {
      await writeResponse(res, result, req.method ?? "GET");
      return REJECTED;
    }

    if (result.auth_enabled && !result.user && auth === "renown") {
      writeError(res, 401, "Authentication required");
      return REJECTED;
    }

    return { user: result.user, authEnabled: result.auth_enabled };
  }

  /** Builds the Fetch Request from the raw stream and runs the handler. */
  async #serve(
    spec: RouteSpec,
    body: NonNullable<RouteSpec["body"]>,
    req: IncomingMessage,
    res: ServerResponse,
    ctx: Omit<RouteContext, "rawBody" | "signal">,
  ): Promise<void> {
    const method = req.method ?? "GET";
    const url = `${ctx.transport.baseUrl}${req.url ?? "/"}`;

    const controller = new AbortController();
    req.once("close", () => controller.abort());

    let raw: Buffer | undefined;
    let init: RequestInit & { duplex?: "half" } = {
      method,
      headers: fetchHeaders(req),
      signal: controller.signal,
    };

    const carriesBody = method !== "GET" && method !== "HEAD";
    if (carriesBody && body !== "none") {
      if (body === "stream") {
        init = {
          ...init,
          body: Readable.toWeb(req) as ReadableStream,
          duplex: "half",
        };
      } else {
        try {
          raw = await readBody(
            req,
            spec.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
          );
        } catch (error) {
          if (error instanceof BodyTooLargeError) {
            // The rest of the body is never read, so the connection cannot be
            // reused: leftover bytes would be parsed as the next request.
            res.setHeader("connection", "close");
            res.once("finish", () => req.destroy());
            writeError(res, 413, "Payload too large");
            return;
          }
          throw error;
        }
        // Verbatim bytes, so a handler verifying a signature over the payload sees what the client sent.
        // A view, not a copy: an upload can be large.
        /* The narrowing is for TypeScript: `BufferSource` excludes a SharedArrayBuffer-backed view while Buffer's
         * `.buffer` is the wider `ArrayBufferLike`; Node never pools a Buffer on shared memory, so it is sound. */
        if (raw.length)
          init = {
            ...init,
            body: new Uint8Array(
              raw.buffer as ArrayBuffer,
              raw.byteOffset,
              raw.byteLength,
            ),
          };
      }
    }

    const response = await spec.handler(new Request(url, init), {
      ...ctx,
      rawBody: body === "raw" ? (raw ?? Buffer.alloc(0)) : undefined,
      signal: controller.signal,
    });

    await writeResponse(res, response, method);
  }
}

const REJECTED = Symbol("rejected");

function routeParams(req: IncomingMessage): Record<string, string> {
  const params = (req as IncomingMessage & { params?: unknown }).params;
  if (!params || typeof params !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.join("/");
  }
  return out;
}

/** Stands in for a package that cannot be routed — its key resolves to no npm name. Registering a route throws with
 * the reason; nothing else does, so the package still loads and its non-HTTP behaviour is unaffected. */
class UnroutableScope implements IHttpScope {
  readonly owner: string;
  readonly baseUrl = "";
  readonly #reason: string;

  constructor(packageKey: string, reason: string) {
    this.owner = packageKey;
    this.#reason = reason;
  }

  #refuse(): never {
    throw new Error(
      `Package "${this.owner}" cannot host HTTP routes: ${this.#reason}`,
    );
  }

  get(): never {
    this.#refuse();
  }
  post(): never {
    this.#refuse();
  }
  put(): never {
    this.#refuse();
  }
  patch(): never {
    this.#refuse();
  }
  delete(): never {
    this.#refuse();
  }
  head(): never {
    this.#refuse();
  }
  route(): never {
    this.#refuse();
  }
  nodeRoute(): never {
    this.#refuse();
  }
  get webhooks(): IWebhookScope {
    return unavailableWebhooks(this.owner);
  }
  dispose(): void {
    // Nothing was ever registered.
  }
}

/** Stands in when the host has no webhook store configured. */
function unavailableWebhooks(packageName: string): IWebhookScope {
  return {
    // No endpoints exist to advertise, so the question does not arise.
    hasPublicOrigin: false,
    register: () =>
      Promise.reject(
        new Error(
          `Webhooks are not available on this host, so "${packageName}" cannot register one`,
        ),
      ),
  };
}
