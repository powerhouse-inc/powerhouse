import { childLogger } from "document-model";
import type { IncomingMessage, ServerResponse } from "node:http";
import posix from "node:path/posix";
import { BodyTooLargeError, readBody, writeError } from "./node-response.js";
import type {
  IHttpScope,
  IWebhookScope,
  ScopedRouteHandle,
  WebhookPolicy,
  WebhookField,
  WebhookSpec,
} from "./types.js";
import type { IWebhookStore } from "./webhook-store.js";
import {
  parseWebhookBody,
  redactHeaders,
  schemeHeader,
  verifyWebhook,
} from "./webhook-verify.js";

const logger = childLogger(["reactor-api", "webhooks"]);

/** The flat, token-addressed path family. */
export const WEBHOOK_SEGMENT = "webhooks";

const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const DEFAULT_DEDUPE_TTL_SECONDS = 300;

export interface WebhookServiceOptions {
  store: IWebhookStore;
  basePath?: string;
  /** Public origin to advertise, e.g. https://switchboard.example. */
  publicUrl?: string;
}

type Registration = { namespace: string; spec: WebhookSpec };

/** One host route for `/webhooks/:token`, dispatching by token. The flat path leaks
 * neither package nor document; the namespace lives in the token record, which is also what stops one package's token reaching another's handler. */
export class WebhookService {
  readonly #store: IWebhookStore;
  readonly #path: string;
  readonly #publicUrl: string | undefined;
  // Layer 1, not the adapter: same dispatch, refusal and disposal path every package
  // route gets, so the two cannot drift on what a request means.
  #scope: IHttpScope | undefined;
  readonly #registrations = new Map<string, Registration>();
  #routes: ScopedRouteHandle[] = [];

  constructor({ store, basePath = "/", publicUrl }: WebhookServiceOptions) {
    this.#store = store;
    this.#path = posix.join("/", basePath, WEBHOOK_SEGMENT);
    this.#publicUrl = publicUrl?.replace(/\/+$/, "");
  }

  /** The scope the endpoint family serves from, handed over once the route service exists;
   * separate from the constructor only because that service takes this one as an option. */
  attach(scope: IHttpScope): void {
    this.#scope = scope;
  }

  async init(): Promise<void> {
    await this.#store.init();
    if (this.#routes.length) return;
    if (!this.#scope) {
      throw new Error(
        "The webhook service has no HTTP scope; the host must call attach() before a package registers",
      );
    }

    // Every method: a provider's verification round may probe with GET even when its
    // deliveries are POST, and refusing a method is the registration's call.

    // Truthfully public: the token in the path is the whole credential, and verification
    // is the registration's policy, not the host's auth — as is the rate, applied per registration in `#deliver`.
    this.#routes = [
      this.#scope.nodeRoute({
        method: ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"],
        path: ":token",
        auth: "public",
        handler: (req, res, ctx) => void this.#deliver(req, res, ctx.params),
      }),
    ];
  }

  dispose(): void {
    for (const handle of this.#routes) handle.dispose();
    this.#routes = [];
    this.#registrations.clear();
  }

  /** The facade a package's HTTP scope exposes as `scope.webhooks`. */
  scopeFor(namespace: string): IWebhookScope {
    return {
      hasPublicOrigin: this.hasPublicOrigin,
      register: async (spec: WebhookSpec) => {
        await this.init();
        const key = `${namespace}|${spec.name}`;
        this.#registrations.set(key, { namespace, spec });
        return {
          endpointFor: async (ownerKey: string) => {
            const row = await this.#store.ensure(
              namespace,
              spec.name,
              ownerKey,
            );
            return {
              token: row.token,
              url: this.urlFor(row.token),
              createdAt: row.createdAt,
            };
          },
          revoke: (ownerKey: string) =>
            this.#store.revoke(namespace, spec.name, ownerKey),
          list: async () =>
            (await this.#store.list(namespace, spec.name)).map((row) => ({
              key: row.ownerKey,
              token: row.token,
              url: this.urlFor(row.token),
              createdAt: row.createdAt,
            })),
        };
      },
    };
  }

  /** Releases every registration a package made. */
  disposeScope(namespace: string): void {
    for (const [key, registration] of this.#registrations) {
      if (registration.namespace === namespace) {
        this.#registrations.delete(key);
      }
    }
  }

  /** The URL to hand a provider. Absolute whenever the host knows its own origin: a
   * relative path is useless to the third party that has to call it. */
  urlFor(token: string): string {
    const path = posix.join(this.#path, token);
    return this.#publicUrl ? `${this.#publicUrl}${path}` : path;
  }

  /** Whether `urlFor` can produce something a provider could call. */
  get hasPublicOrigin(): boolean {
    return this.#publicUrl !== undefined;
  }

  async #deliver(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
  ): Promise<void> {
    const token = params.token;
    if (!token) {
      writeError(res, 404, "Unknown endpoint");
      return;
    }

    try {
      const row = await this.#store.find(token);
      // Unknown, malformed and disarmed all answer this same 404, so a prober cannot tell
      // a live endpoint from a dead one; a live endpoint's verification failure answers 401, the caller having proved the token exists by holding it.
      if (!row) {
        writeError(res, 404, "Unknown endpoint");
        return;
      }

      const registrationKey = `${row.namespace}|${row.endpoint}`;
      const registration = this.#registrations.get(registrationKey);
      if (!registration) {
        // The token is real but its package is not loaded on this host.
        writeError(res, 503, "Endpoint temporarily unavailable");
        return;
      }

      const { spec } = registration;
      const method = (req.method ?? "POST").toUpperCase();

      const perEndpoint = spec.policyFor
        ? await spec.policyFor(row.ownerKey)
        : {};
      if (!perEndpoint) {
        // Not armed. Answers as an unknown token does, deliberately.
        writeError(res, 404, "Unknown endpoint");
        return;
      }

      // Declared defaults, then what this endpoint carries. Only `defaults` participates,
      // which is why the spec keeps its policy fields under their own key.
      const policy: WebhookPolicy = { ...spec.defaults, ...perEndpoint };

      if (policy.methods && !policy.methods.includes(method)) {
        writeError(res, 405, "Method not allowed");
        return;
      }

      let raw: Buffer;
      try {
        raw = await readBody(
          req,
          policy.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
        );
      } catch (error) {
        if (error instanceof BodyTooLargeError) {
          res.setHeader("connection", "close");
          res.once("finish", () => req.destroy());
          writeError(res, 413, "Payload too large");
          return;
        }
        throw error;
      }

      const verification = policy.verify;
      if (verification) {
        const result = verifyWebhook({
          verification,
          headers: headerRecord(req),
          raw,
        });
        if (!result.ok) {
          // The namespace starts with `@`, the logger's replacement token; passed
          // positionally it stays a value, not a placeholder to be substituted away.
          logger.warn(
            "Rejected webhook delivery for @package/@endpoint: @reason",
            row.namespace,
            row.endpoint,
            result.reason,
          );
          writeError(res, 401, "Signature verification failed");
          return;
        }
      }

      // A fixed base: only the query is read from this, so the request's own
      // origin never enters it and cannot be spoofed through it.
      const url = new URL(req.url ?? "/", "http://localhost");
      const queryParams = Object.fromEntries(url.searchParams);
      const signatureHeader = verification
        ? schemeHeader(verification)
        : undefined;
      const headers = headerRecord(req);
      const body = parseWebhookBody(raw, headers["content-type"]);

      // The provider's verification round: echo the value, invoke nothing. From the merged
      // policy, not the registration — the echoed field is per-endpoint configuration.
      const challenge = challengeValue(
        policy.challengeField,
        queryParams,
        headers,
        body,
      );
      if (challenge !== undefined) {
        res.statusCode = 200;
        res.setHeader("content-type", "text/plain");
        res.end(challenge);
        return;
      }

      if (policy.dedupe) {
        const key = dedupeKey(policy.dedupe.field, queryParams, headers, body);
        if (
          key !== undefined &&
          (await this.#store.seen(
            token,
            key,
            policy.dedupe.ttlSeconds ?? DEFAULT_DEDUPE_TTL_SECONDS,
          ))
        ) {
          // A redelivery is not an error: answer as though it succeeded, so the
          // provider stops retrying, but run nothing twice.
          res.statusCode = 200;
          res.end();
          return;
        }
      }

      const reply = await spec.onRequest({
        key: row.ownerKey,
        method,
        path: url.pathname,
        queryParams,
        headers: redactHeaders(headers, signatureHeader),
        raw,
        body,
      });

      res.statusCode = reply.status;
      if (reply.body !== undefined && method !== "HEAD") {
        res.setHeader("content-type", reply.contentType ?? "text/plain");
        res.end(reply.body);
      } else {
        res.end();
      }
    } catch (error) {
      // Not the token or the URL: the token is the capability, and the URL carries it.
      logger.error(
        "Webhook delivery failed for @method",
        req.method,
        error as Error,
      );
      writeError(res, 500, "Internal server error");
    }
  }
}

function headerRecord(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers[name.toLowerCase()] = Array.isArray(value)
      ? value.join(", ")
      : value;
  }
  return headers;
}

function scalar(value: unknown): string | undefined {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

/** Walks a dot-separated path into the parsed body. */
function bodyPath(path: string, body: unknown): string | undefined {
  let current: unknown = body;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return scalar(current);
}

/** Resolves where a provider put a value. A bare string means query first, then a
 * top-level body field; `{ header }` and `{ body }` reach what that cannot — GitHub's delivery id is a header, Stripe's event id is nested. */
function fieldValue(
  field: WebhookField,
  queryParams: Record<string, string>,
  headers: Record<string, string>,
  body: unknown,
): string | undefined {
  if (typeof field === "object") {
    return "header" in field
      ? scalar(headers[field.header.toLowerCase()])
      : bodyPath(field.body, body);
  }
  const fromQuery = scalar(queryParams[field]);
  if (fromQuery !== undefined) return fromQuery;
  return body && typeof body === "object"
    ? scalar((body as Record<string, unknown>)[field])
    : undefined;
}

function challengeValue(
  field: WebhookField | undefined,
  queryParams: Record<string, string>,
  headers: Record<string, string>,
  body: unknown,
): string | undefined {
  return field === undefined
    ? undefined
    : fieldValue(field, queryParams, headers, body);
}

function dedupeKey(
  field: WebhookField,
  queryParams: Record<string, string>,
  headers: Record<string, string>,
  body: unknown,
): string | undefined {
  return fieldValue(field, queryParams, headers, body);
}
