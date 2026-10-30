// OAuth2 apps owned by the publisher, configured once per host, instead of a
// client id and secret on every connection. A connection names an app in its
// config (`oauth_app`); a sign-in picks that app's client by where the
// provider sends the browser back: a loopback callback (the switchboard on the
// user's own machine) takes the desktop ("installed") client, which providers
// accept on any loopback port and which always signs in with PKCE; anything
// else takes the web client, whose redirect URI the provider has registered.
// Client secrets live in the host's secret store; the documents only ever
// hold the app's id.
//
// An app may name a relay instead of a web client: a broker the publisher
// runs that holds the web client's secret. Its one redirect URI is registered
// with the provider and forwards the provider's answer to the host the
// sign-in started on (named in the state); its token URL exchanges and
// refreshes codes for that host, adding the secret. Hosts whose own callback
// is not registered with the provider, such as cloud environments with a
// hostname each, sign in through it with PKCE and never hold the secret. A
// web client file on the host always wins over the relay.
import { readFile } from "node:fs/promises";
import type { SecretStore } from "../pieces/index.js";

/** The connection config key naming an app of the registry. */
export const OAUTH_APP = "oauth_app";
/**
 * The connection config key for the scopes to ask for instead of the piece's
 * own: a list, or one space-separated string. A read-only integration asks
 * for `calendar.readonly` where the piece would ask to edit too.
 */
export const OAUTH_SCOPES = "oauth_scopes";

export type OAuthClientKind = "web" | "desktop";

export interface OAuthAppClient {
  appId: string;
  kind: OAuthClientKind;
  clientId: string;
  clientSecretRef: string;
}

export interface OAuthAppRegistry {
  client(appId: string, kind: OAuthClientKind): OAuthAppClient | undefined;
  clients(appId: string): OAuthAppClient[];
  /** The app's relay, or undefined when it has none. */
  relay(appId: string): OAuthAppRelay | undefined;
}

/** One app as a host configures it: per client kind, the provider's client file. */
export interface OAuthAppDefinition {
  id: string;
  /** Paths to the provider's downloaded client files (Google's client_secret_*.json). */
  clients: Partial<Record<OAuthClientKind, string>>;
  /**
   * The broker a web sign-in goes through when the host has no web client
   * file. Absent, a web sign-in needs the web client.
   */
  relay?: OAuthAppRelay;
}

/**
 * A token broker for an app's web client: the provider sends the browser to
 * `redirectUri`, which forwards to the callback the state names; `tokenUrl`
 * takes the code exchange and every refresh, with `clientId` and no secret.
 */
export interface OAuthAppRelay {
  clientId: string;
  redirectUri: string;
  tokenUrl: string;
}

function httpsUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw === "") return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return undefined;
  }
  return url.href;
}

/**
 * A relay as configured, or the reason it cannot be used: it needs a client
 * id and two absolute https URLs without credentials.
 */
export function parseRelay(raw: unknown): OAuthAppRelay | string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return "not an object with clientId, redirectUri and tokenUrl";
  }
  const { clientId, redirectUri, tokenUrl } = raw as Record<string, unknown>;
  if (typeof clientId !== "string" || clientId === "") {
    return "no clientId";
  }
  const redirect = httpsUrl(redirectUri);
  if (!redirect) return "redirectUri is not an absolute https URL";
  const token = httpsUrl(tokenUrl);
  if (!token) return "tokenUrl is not an absolute https URL";
  return { clientId, redirectUri: redirect, tokenUrl: token };
}

export class StaticOAuthAppRegistry implements OAuthAppRegistry {
  constructor(
    private readonly entries: readonly OAuthAppClient[],
    private readonly relays: ReadonlyMap<string, OAuthAppRelay> = new Map(),
  ) {}

  client(appId: string, kind: OAuthClientKind): OAuthAppClient | undefined {
    return this.entries.find((e) => e.appId === appId && e.kind === kind);
  }

  clients(appId: string): OAuthAppClient[] {
    return this.entries.filter((e) => e.appId === appId);
  }

  relay(appId: string): OAuthAppRelay | undefined {
    return this.relays.get(appId);
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Desktop for a callback to this machine, web for one the provider reaches over the internet. */
export function clientKindFor(redirectUri: string): OAuthClientKind {
  let host: string;
  try {
    host = new URL(redirectUri).hostname;
  } catch {
    return "web";
  }
  return LOOPBACK.has(host) ? "desktop" : "web";
}

/**
 * How this host signs in with a publisher's app for a callback: the
 * desktop client for one to this machine; else the web client when the host
 * has its file; else the app's relay; else not at all.
 */
export type OAuthSignIn =
  | { mode: "desktop" | "web"; client: OAuthAppClient }
  | { mode: "relay"; relay: OAuthAppRelay }
  | { mode: "none"; kind: OAuthClientKind };

export function oauthSignInFor(
  apps: OAuthAppRegistry,
  appId: string,
  redirectUri: string,
): OAuthSignIn {
  const kind = clientKindFor(redirectUri);
  const client = apps.client(appId, kind);
  if (client) return { mode: kind, client };
  const relay = kind === "web" ? apps.relay(appId) : undefined;
  return relay ? { mode: "relay", relay } : { mode: "none", kind };
}

/**
 * Config key the runtime writes after a sign-in: the scopes the provider
 * granted (its token response's `scope`, else the ones asked for). A
 * connection whose `oauth_scopes` reach beyond them needs a new sign-in.
 */
export const OAUTH_GRANTED_SCOPES = "oauth_granted_scopes";

/** What a sign-in was granted: the token's own `scope`, else what the connection asked for. */
export function grantedScopes(
  tokenScope: string | undefined,
  config: Record<string, unknown>,
): string[] | undefined {
  const granted = (tokenScope ?? "").split(/[\s,]+/).filter(Boolean);
  return granted.length > 0 ? granted : scopesOverride(config);
}

/** The scopes a connection asks for instead of the piece's, or undefined to keep the piece's. */
export function scopesOverride(
  config: Record<string, unknown>,
): string[] | undefined {
  const raw = config[OAUTH_SCOPES];
  const list = Array.isArray(raw)
    ? raw.filter((s): s is string => typeof s === "string")
    : typeof raw === "string"
      ? raw.split(/\s+/)
      : [];
  const scopes = list.map((s) => s.trim()).filter(Boolean);
  return scopes.length > 0 ? scopes : undefined;
}

/**
 * The client id and secret in a provider's client file: Google's
 * `{ installed | web: { client_id, client_secret } }`, or the two keys at the
 * top level.
 */
export function parseClientFile(text: string): {
  clientId: string;
  clientSecret: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("not JSON");
  }
  const root = (parsed ?? {}) as Record<string, unknown>;
  const inner = (root.installed ?? root.web ?? root) as Record<string, unknown>;
  const clientId = inner.client_id;
  const clientSecret = inner.client_secret;
  if (typeof clientId !== "string" || !clientId) {
    throw new Error("no client_id");
  }
  if (typeof clientSecret !== "string" || !clientSecret) {
    throw new Error("no client_secret");
  }
  return { clientId, clientSecret };
}

/** The label a client secret carries in the store, so a restart finds it again. */
export function clientSecretLabel(appId: string, kind: OAuthClientKind) {
  return `oauth-app:${appId}:${kind}`;
}

/**
 * Reads each configured client file and keeps its secret in the store under a
 * fixed label: created the first time, rotated when the file changed, left
 * alone otherwise. A client whose file cannot be read is skipped with the
 * reason, so one bad file does not take the others down. A relay without a
 * client id or with a URL that is not absolute https is dropped with the
 * reason.
 */
export async function loadOAuthApps(
  definitions: readonly OAuthAppDefinition[],
  store: SecretStore,
  options: {
    read?: (path: string) => Promise<string>;
    onSkip?: (appId: string, kind: OAuthClientKind, reason: string) => void;
    onRelayDropped?: (appId: string, reason: string) => void;
  } = {},
): Promise<StaticOAuthAppRegistry> {
  const read = options.read ?? ((path: string) => readFile(path, "utf8"));
  const existing = new Map(
    (await store.list())
      // A document's secret may share the label; only a host secret is the app's.
      .filter((s) => s.status === "ACTIVE" && s.label && s.ownerId === null)
      .map((s) => [s.label!, s.ref]),
  );
  const entries: OAuthAppClient[] = [];
  const relays = new Map<string, OAuthAppRelay>();
  for (const app of definitions) {
    if (app.relay !== undefined) {
      const relay = parseRelay(app.relay);
      if (typeof relay === "string") options.onRelayDropped?.(app.id, relay);
      else relays.set(app.id, relay);
    }
    for (const kind of ["desktop", "web"] as const) {
      const path = app.clients[kind];
      if (!path) continue;
      let client: { clientId: string; clientSecret: string };
      try {
        client = parseClientFile(await read(path));
      } catch (error) {
        options.onSkip?.(
          app.id,
          kind,
          `${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      const label = clientSecretLabel(app.id, kind);
      let ref = existing.get(label);
      if (ref) {
        if ((await store.get(ref, null)) !== client.clientSecret) {
          await store.rotate(ref, client.clientSecret);
        }
      } else {
        ref = (
          await store.create({
            value: client.clientSecret,
            label,
            ownerId: null,
          })
        ).ref;
      }
      entries.push({
        appId: app.id,
        kind,
        clientId: client.clientId,
        clientSecretRef: ref,
      });
    }
  }
  return new StaticOAuthAppRegistry(entries, relays);
}
