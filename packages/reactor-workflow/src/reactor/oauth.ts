// OAuth2 authorization-code sign-in for connections that bring their own app:
// pending attempts, the code exchange and token refresh.
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import {
  isPrivateAddress,
  parseAddress,
  type EgressPolicy,
  type OAuth2MethodDescriptor,
  type SecretStore,
} from "../pieces/index.js";
import { childLogger } from "document-model";
import { createHash, randomBytes } from "node:crypto";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

// Names the connection's secretRefs and config use for the OAuth2 parts.
export const OAUTH_CLIENT_ID = "client_id";
export const OAUTH_CLIENT_SECRET = "client_secret";
export const OAUTH_TOKEN = "token";

const ATTEMPT_TTL_MS = 10 * 60 * 1000;
// A claimed attempt still exchanges and checks past its expiry.
const EXCHANGE_GRACE_MS = 2 * 60 * 1000;
// Refreshed this long before expiry, as Activepieces does; at most half a
// short-lived token's lifetime, or it would be due the moment it is issued.
const REFRESH_MARGIN_S = 15 * 60;
const TOKEN_TIMEOUT_MS = 15_000;
const TOKEN_MAX_BYTES = 1024 * 1024;

const oauthLogger = childLogger(["workflow", "oauth"]);

export type OAuthAttemptStatus = "PENDING" | "EXCHANGING" | "OK" | "ERROR";

export interface OAuthAttemptRow {
  state: string;
  connection_id: string;
  client_id: string;
  client_secret_ref: string;
  code_verifier: string | null;
  redirect_uri: string;
  token_url: string;
  authorization_method: string | null;
  return_url: string | null;
  status: OAuthAttemptStatus;
  error: string | null;
  created_at: string;
  expires_at: string;
}

interface OAuthDB {
  oauth_attempt: OAuthAttemptRow;
}

// The token set stored as one secret; only the host writes it.
export interface OAuthTokenSet {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  // Unix seconds the token was issued at.
  claimed_at: number;
  scope?: string;
  token_url: string;
  authorization_method?: "HEADER" | "BODY";
  redirect_url: string;
  // The provider's whole token response; pieces read fields off it.
  data: Record<string, unknown>;
}

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}

async function up(db: IRelationalDb<OAuthDB>): Promise<void> {
  await db.schema
    .createTable("oauth_attempt")
    .addColumn("state", "text", (col) => col.primaryKey())
    .addColumn("connection_id", "text", (col) => col.notNull())
    .addColumn("client_id", "text", (col) => col.notNull())
    .addColumn("client_secret_ref", "text", (col) => col.notNull())
    .addColumn("code_verifier", "text")
    .addColumn("redirect_uri", "text", (col) => col.notNull())
    .addColumn("token_url", "text", (col) => col.notNull())
    .addColumn("authorization_method", "text")
    .addColumn("return_url", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("error", "text")
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("expires_at", "text", (col) => col.notNull())
    .ifNotExists()
    .execute();
}

// `{name}` placeholders in a provider URL, filled from the connection's props.
export function fillOAuthUrl(
  template: string,
  props: Record<string, unknown>,
): string {
  const filled = template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = props[name];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new OAuthError(`Set "${name}" before connecting`);
    }
    return encodeURIComponent(String(value));
  });
  let url: URL;
  try {
    url = new URL(filled);
  } catch {
    throw new OAuthError(`"${filled}" is not a valid URL`);
  }
  return url.href;
}

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

export interface StartOAuthInput {
  connectionId: string;
  method: OAuth2MethodDescriptor;
  props: Record<string, unknown>;
  clientId: string;
  clientSecretRef: string;
  redirectUri: string;
  returnUrl?: string;
}

export interface OAuthStart {
  state: string;
  authorizationUrl: string;
  redirectUri: string;
  expiresAt: string;
}

export interface OAuthAttemptView {
  connectionId: string;
  status: OAuthAttemptStatus;
  error: string | null;
  returnUrl: string | null;
}

export class OAuthAttemptStore {
  private constructor(private readonly db: IRelationalDb<OAuthDB>) {}

  static async create(relationalDb: IRelationalDb): Promise<OAuthAttemptStore> {
    const db = (await relationalDb.createNamespace(
      "oauth",
    )) as IRelationalDb<OAuthDB>;
    await up(db);
    return new OAuthAttemptStore(db);
  }

  async start(input: StartOAuthInput): Promise<OAuthStart> {
    const now = new Date();
    // Finished and abandoned attempts are kept a day, so a late poll still answers.
    await this.db
      .deleteFrom("oauth_attempt")
      .where(
        "expires_at",
        "<",
        new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      )
      .execute();

    const { method } = input;
    const state = base64url(randomBytes(32));
    const pkce = method.pkce === true;
    const verifier = pkce ? base64url(randomBytes(48)) : null;
    const authUrl = new URL(fillOAuthUrl(method.authUrl, input.props));
    const params = authUrl.searchParams;
    params.set("response_type", "code");
    params.set("client_id", input.clientId);
    params.set("redirect_uri", input.redirectUri);
    params.set("state", state);
    if (method.scope.length > 0) params.set("scope", method.scope.join(" "));
    // Activepieces' defaults: without them Google issues no refresh token.
    params.set("access_type", "offline");
    const prompt = method.prompt ?? "consent";
    if (prompt !== "omit") params.set("prompt", prompt);
    if (verifier) {
      const plain = method.pkceMethod === "plain";
      params.set(
        "code_challenge",
        plain
          ? verifier
          : base64url(createHash("sha256").update(verifier).digest()),
      );
      params.set("code_challenge_method", plain ? "plain" : "S256");
    }
    for (const [key, value] of Object.entries(method.extra ?? {})) {
      params.set(key, value);
    }

    const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS).toISOString();
    await this.db
      .insertInto("oauth_attempt")
      .values({
        state,
        connection_id: input.connectionId,
        client_id: input.clientId,
        client_secret_ref: input.clientSecretRef,
        code_verifier: verifier,
        redirect_uri: input.redirectUri,
        token_url: fillOAuthUrl(method.tokenUrl, input.props),
        authorization_method: method.authorizationMethod ?? null,
        return_url: input.returnUrl ?? null,
        status: "PENDING",
        error: null,
        created_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .execute();
    return {
      state,
      authorizationUrl: authUrl.href,
      redirectUri: input.redirectUri,
      expiresAt,
    };
  }

  async view(state: string): Promise<OAuthAttemptView | undefined> {
    const row = await this.db
      .selectFrom("oauth_attempt")
      .selectAll()
      .where("state", "=", state)
      .executeTakeFirst();
    if (!row) return undefined;
    // An exchange still EXCHANGING well past expiry died with its process.
    const deadline =
      Date.parse(row.expires_at) +
      (row.status === "EXCHANGING" ? EXCHANGE_GRACE_MS : 0);
    const unfinished = row.status === "PENDING" || row.status === "EXCHANGING";
    const expired = unfinished && deadline < Date.now();
    return {
      connectionId: row.connection_id,
      status: expired ? "ERROR" : row.status,
      error: expired ? "The sign-in expired before it finished" : row.error,
      returnUrl: row.return_url,
    };
  }

  // Takes a pending attempt for its one exchange. Undefined when it is
  // unknown, expired or already taken, so a replayed callback does nothing.
  // RETURNING, not numUpdatedRows: the knex-backed dialect reports no count.
  claim(state: string): Promise<OAuthAttemptRow | undefined> {
    return this.db
      .updateTable("oauth_attempt")
      .set({ status: "EXCHANGING" })
      .where("state", "=", state)
      .where("status", "=", "PENDING")
      .where("expires_at", ">", new Date().toISOString())
      .returningAll()
      .executeTakeFirst();
  }

  async finish(state: string, error: string | null): Promise<void> {
    await this.db
      .updateTable("oauth_attempt")
      .set({ status: error === null ? "OK" : "ERROR", error })
      .where("state", "=", state)
      .execute();
  }
}

// ── token endpoint ─────────────────────────────────────────────────────────

function familyOf(address: string): "ipv4" | "ipv6" {
  return net.isIP(address) === 6 ? "ipv6" : "ipv4";
}

function allowedAddresses(policy: EgressPolicy | undefined): net.BlockList {
  const list = new net.BlockList();
  for (const spec of policy?.allowAddresses ?? []) {
    const slash = spec.indexOf("/");
    const ip = parseAddress(slash === -1 ? spec : spec.slice(0, slash));
    if (!ip) continue;
    const family = familyOf(ip);
    const width = family === "ipv6" ? 128 : 32;
    list.addSubnet(
      ip,
      slash === -1 ? width : Number(spec.slice(slash + 1)),
      family,
    );
  }
  return list;
}

// POSTs a form to a token endpoint. The address is checked at connect time,
// so a name that resolves to private space is refused as a piece's would be.
export async function postTokenForm(
  url: string,
  form: Record<string, string>,
  headers: Record<string, string>,
  egress?: EgressPolicy,
): Promise<Record<string, unknown>> {
  const target = new URL(url);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new OAuthError(`Token URL "${url}" is not http(s)`);
  }
  const allowed = allowedAddresses(egress);
  const named = (address: string) => {
    const ip = parseAddress(address);
    return ip !== undefined && allowed.check(ip, familyOf(ip));
  };
  // Plain http only reaches an address the operator named.
  const permitted = (address: string) =>
    named(address) ||
    (target.protocol === "https:" &&
      (egress?.allowPrivateAddresses === true || !isPrivateAddress(address)));
  const refused = (hostname: string) =>
    new OAuthError(`Token URL host "${hostname}" is not reachable from here`);
  // A literal IP never reaches the lookup below.
  const literal = parseAddress(target.hostname.replace(/^\[|\]$/g, ""));
  if (literal !== undefined && !permitted(literal)) {
    throw refused(target.hostname);
  }
  // Node asks for every address when it races IPv4 against IPv6.
  const lookup = ((
    hostname: string,
    options: dns.LookupOptions,
    callback: (
      error: Error | null,
      address: string | dns.LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, []);
      const usable = addresses.filter((entry) => permitted(entry.address));
      if (usable.length === 0) return callback(refused(hostname), []);
      if (options.all) return callback(null, usable);
      callback(null, usable[0].address, usable[0].family);
    });
  }) as net.LookupFunction;

  const body = new URLSearchParams(form).toString();
  const client = target.protocol === "https:" ? https : http;
  const { status, contentType, text } = await new Promise<{
    status: number;
    contentType: string;
    text: string;
  }>((resolve, reject) => {
    const request = client.request(
      target,
      {
        method: "POST",
        lookup,
        timeout: TOKEN_TIMEOUT_MS,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "content-length": Buffer.byteLength(body).toString(),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > TOKEN_MAX_BYTES) {
            request.destroy(new OAuthError("Token response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            contentType: String(response.headers["content-type"] ?? ""),
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        response.on("error", reject);
      },
    );
    request.on("timeout", () =>
      request.destroy(new OAuthError("Token endpoint timed out")),
    );
    request.on("error", reject);
    request.end(body);
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = contentType.includes("application/x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(text))
      : (JSON.parse(text) as Record<string, unknown>);
  } catch {
    throw new OAuthError(
      `Token endpoint answered ${status} with a body that is not JSON`,
    );
  }
  // Some providers (Slack) answer 200 with { ok: false, error }.
  const error = parsed.error ?? (parsed.ok === false ? "error" : undefined);
  if (status < 200 || status >= 300 || error !== undefined) {
    const description =
      typeof parsed.error_description === "string"
        ? `: ${parsed.error_description}`
        : "";
    throw new OAuthError(
      `Token endpoint refused (${typeof error === "string" ? error : status})${description}`,
    );
  }
  if (typeof parsed.access_token !== "string") {
    throw new OAuthError("Token endpoint answered without an access_token");
  }
  return parsed;
}

function clientAuth(
  method: "HEADER" | "BODY" | undefined,
  clientId: string,
  clientSecret: string,
): { form: Record<string, string>; headers: Record<string, string> } {
  if (method === "HEADER") {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    return { form: {}, headers: { authorization: `Basic ${basic}` } };
  }
  return {
    form: { client_id: clientId, client_secret: clientSecret },
    headers: {},
  };
}

function authorizationMethod(
  value: string | null | undefined,
): "HEADER" | "BODY" | undefined {
  return value === "HEADER" || value === "BODY" ? value : undefined;
}

function tokenSetFrom(
  response: Record<string, unknown>,
  context: Pick<
    OAuthTokenSet,
    "token_url" | "authorization_method" | "redirect_url"
  >,
  previous?: OAuthTokenSet,
): OAuthTokenSet {
  const expires = Number(response.expires_in);
  const refresh =
    typeof response.refresh_token === "string"
      ? response.refresh_token
      : previous?.refresh_token;
  const scope =
    typeof response.scope === "string" ? response.scope : previous?.scope;
  return {
    access_token: response.access_token as string,
    ...(refresh ? { refresh_token: refresh } : {}),
    token_type:
      typeof response.token_type === "string" ? response.token_type : "Bearer",
    ...(Number.isFinite(expires) && expires > 0 ? { expires_in: expires } : {}),
    claimed_at: Math.round(Date.now() / 1000),
    ...(scope ? { scope } : {}),
    token_url: context.token_url,
    ...(context.authorization_method
      ? { authorization_method: context.authorization_method }
      : {}),
    redirect_url: context.redirect_url,
    data: { ...previous?.data, ...response },
  };
}

export async function exchangeCode(
  attempt: OAuthAttemptRow,
  code: string,
  clientSecret: string,
  egress?: EgressPolicy,
): Promise<OAuthTokenSet> {
  const method = authorizationMethod(attempt.authorization_method);
  const auth = clientAuth(method, attempt.client_id, clientSecret);
  const response = await postTokenForm(
    attempt.token_url,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: attempt.redirect_uri,
      ...(attempt.code_verifier
        ? { code_verifier: attempt.code_verifier }
        : {}),
      ...auth.form,
    },
    auth.headers,
    egress,
  );
  return tokenSetFrom(response, {
    token_url: attempt.token_url,
    authorization_method: method,
    redirect_url: attempt.redirect_uri,
  });
}

export function parseTokenSet(value: string): OAuthTokenSet {
  const parsed = JSON.parse(value) as OAuthTokenSet;
  if (typeof parsed.access_token !== "string") {
    throw new OAuthError("Stored OAuth2 token is malformed; reconnect");
  }
  return parsed;
}

export function tokenExpired(
  tokens: OAuthTokenSet,
  nowSeconds: number,
): boolean {
  if (tokens.expires_in === undefined) return false;
  return nowSeconds >= tokens.claimed_at + tokens.expires_in;
}

export function tokenDue(tokens: OAuthTokenSet, nowSeconds: number): boolean {
  if (tokens.expires_in === undefined || !tokens.refresh_token) return false;
  const margin = Math.min(REFRESH_MARGIN_S, tokens.expires_in / 2);
  return nowSeconds >= tokens.claimed_at + tokens.expires_in - margin;
}

// What resolution needs from a connection to refresh its token.
export interface OAuthConnectionSource {
  config?: Record<string, unknown>;
  secretRefs?: { name: string; ref: string }[];
}

export interface OAuthTokenRefresher {
  // Rotates the token secret in place when it is close to expiring.
  refreshIfDue(source: OAuthConnectionSource): Promise<void>;
}

export class StoreTokenRefresher implements OAuthTokenRefresher {
  // One refresh per token in this process; the others wait on it.
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly secrets: () => Promise<SecretStore>,
    private readonly egress?: EgressPolicy,
  ) {}

  refreshIfDue(source: OAuthConnectionSource): Promise<void> {
    const refOf = (name: string) =>
      source.secretRefs?.find((entry) => entry.name === name)?.ref;
    const tokenRef = refOf(OAUTH_TOKEN);
    const secretRef = refOf(OAUTH_CLIENT_SECRET);
    const clientId = source.config?.[OAUTH_CLIENT_ID];
    if (!tokenRef || !secretRef || typeof clientId !== "string") {
      return Promise.resolve();
    }
    let pending = this.inFlight.get(tokenRef);
    if (!pending) {
      pending = this.refresh(tokenRef, secretRef, clientId).finally(() =>
        this.inFlight.delete(tokenRef),
      );
      this.inFlight.set(tokenRef, pending);
    }
    return pending;
  }

  private async refresh(
    tokenRef: string,
    secretRef: string,
    clientId: string,
  ): Promise<void> {
    const store = await this.secrets();
    const tokens = parseTokenSet(await store.get(tokenRef));
    if (!tokenDue(tokens, Math.round(Date.now() / 1000))) return;
    const auth = clientAuth(
      tokens.authorization_method,
      clientId,
      await store.get(secretRef),
    );
    let response: Record<string, unknown>;
    try {
      response = await postTokenForm(
        tokens.token_url,
        {
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token!,
          ...auth.form,
        },
        auth.headers,
        this.egress,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // The stored token still works until it expires; a later call retries.
      if (!tokenExpired(tokens, Math.round(Date.now() / 1000))) {
        oauthLogger.warn(
          `Refreshing an OAuth2 token failed; using it until it expires: ${detail}`,
        );
        return;
      }
      throw new OAuthError(
        `Refreshing the OAuth2 token failed; reconnect: ${detail}`,
      );
    }
    // A sign-in that landed meanwhile is newer than this refresh.
    const current = parseTokenSet(await store.get(tokenRef));
    if (
      current.access_token !== tokens.access_token ||
      current.claimed_at !== tokens.claimed_at
    ) {
      return;
    }
    await store.rotate(
      tokenRef,
      JSON.stringify(tokenSetFrom(response, tokens, tokens)),
    );
  }
}
