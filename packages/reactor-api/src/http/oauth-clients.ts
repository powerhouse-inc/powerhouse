import {
  warnNotOwnerOnly,
  writeOwnerOnlyFile,
} from "@powerhousedao/shared/clis/owner-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * The OAuth clients registered here by dynamic client registration (RFC
 * 7591), one file each in the store's data folder,
 * `<dataDir>/.ph/oauth/clients/<client_id>.json`, so every replica serves
 * them. Public clients only (MCP clients): no secret, `none` at the token
 * endpoint, so a client proves nothing by itself; PKCE and the exact redirect
 * URI bind a code to the request that asked for it, and the person's own
 * credential approves it.
 */

const FORMAT = "ph-oauth-client";

/** How long a registration holds that no grant was ever approved for. */
export const UNUSED_CLIENT_TTL_MS = 60 * 60_000;
/** How long a registration holds after a grant of it was last approved; a client registers again after. */
export const OAUTH_CLIENT_TTL_MS = 30 * 24 * 60 * 60_000;
/** Redirect URIs one client may register. */
export const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Schemes no redirect URI takes: the browser runs, reads or serves them
 * itself, or they carry no answer back to an app.
 */
const REFUSED_SCHEMES = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "blob:",
  "about:",
  "ws:",
  "wss:",
  "ftp:",
]);

export type OAuthClient = {
  format: typeof FORMAT;
  version: 1;
  /** `phc_<32 hex>`. */
  clientId: string;
  /** As the client named itself, shown on the consent page. */
  clientName?: string;
  /** The redirect URIs a code may go to: exactly, a loopback one at any port. */
  redirectUris: string[];
  /** Who registered it: the requesting address. */
  registeredFrom: string;
  registeredAt: string;
  /** When a grant of it was last approved; never, for an unused client. */
  approvedAt?: string;
  expiresAt: string;
};

function clientsDir(dataDir: string): string {
  return path.join(dataDir, ".ph", "oauth", "clients");
}

export function isOAuthClientId(id: unknown): id is string {
  return typeof id === "string" && /^phc_[0-9a-f]{32}$/.test(id);
}

function clientFile(dataDir: string, id: string): string {
  return path.join(clientsDir(dataDir), `${id}.json`);
}

/**
 * Why `uri` cannot be a redirect URI here; undefined when it can: https on
 * any host, http on loopback (a native app's listener, RFC 8252 7.3), or an
 * app's own scheme (RFC 8252 7.1, an editor's, say) but none of
 * {@link REFUSED_SCHEMES}; no fragment and no user info. The consent page
 * shows an app's own scheme and its target in full.
 */
export function redirectUriRefusal(uri: unknown): string | undefined {
  if (typeof uri !== "string" || uri === "" || uri.length > MAX_URI_LENGTH) {
    return "a redirect URI is a URL of at most 2000 characters";
  }
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `${uri} is no URL`;
  }
  if (url.hash !== "" || uri.includes("#")) {
    return `${uri} carries a fragment`;
  }
  if (url.username !== "" || url.password !== "") {
    return `${uri} carries user info`;
  }
  if (url.protocol === "https:") return undefined;
  if (url.protocol === "http:") {
    return LOOPBACK.has(url.hostname)
      ? undefined
      : `${uri} is plain http off loopback (localhost, 127.0.0.1, [::1])`;
  }
  if (REFUSED_SCHEMES.has(url.protocol)) {
    return `${uri}: a ${url.protocol} URI takes no redirect`;
  }
  return undefined;
}

/**
 * The redirect URI a request names, when its client registered it: exactly,
 * or for a loopback one at any port (RFC 8252 7.3: a native app's listener
 * takes the port it is given). Without one asked, the client's only one.
 */
export function redirectUriFor(
  registered: readonly string[],
  asked: string | null,
): string | undefined {
  if (asked === null) {
    return registered.length === 1 ? registered[0] : undefined;
  }
  if (registered.includes(asked)) return asked;
  if (!isLoopbackRedirectUri(asked) || redirectUriRefusal(asked)) {
    return undefined;
  }
  const url = new URL(asked);
  const held = registered.some((uri) => {
    if (!isLoopbackRedirectUri(uri)) return false;
    const own = new URL(uri);
    return (
      own.hostname === url.hostname &&
      own.pathname === url.pathname &&
      own.search === url.search
    );
  });
  return held ? asked : undefined;
}

/**
 * Whether `uri` returns to a listener on the person's own computer (RFC 8252
 * 7.3): http on loopback. Sending a browser there takes it to no site of
 * anyone else's, so it may go at once, before the person acts.
 */
export function isLoopbackRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && LOOPBACK.has(url.hostname);
  } catch {
    return false;
  }
}

/** A client name as the consent page may show it; undefined for none. */
export function clientNameOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name === "" ? undefined : name.slice(0, MAX_NAME_LENGTH);
}

export function newOAuthClient(o: {
  clientName?: string;
  redirectUris: string[];
  registeredFrom: string;
  now: number;
}): OAuthClient {
  return {
    format: FORMAT,
    version: 1,
    clientId: `phc_${randomBytes(16).toString("hex")}`,
    ...(o.clientName ? { clientName: o.clientName } : {}),
    redirectUris: o.redirectUris,
    registeredFrom: o.registeredFrom,
    registeredAt: new Date(o.now).toISOString(),
    // Unused until a grant of it is approved: then kept 30 days.
    expiresAt: new Date(o.now + UNUSED_CLIENT_TTL_MS).toISOString(),
  };
}

/** A grant of client `id` was approved: it is kept 30 days from now. */
export function markOAuthClientApproved(
  dataDir: string,
  id: string,
  now: number,
): void {
  if (!isOAuthClientId(id)) return;
  const client = readClientFile(dataDir, id);
  if (!client) return;
  writeOAuthClient(dataDir, {
    ...client,
    approvedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + OAUTH_CLIENT_TTL_MS).toISOString(),
  });
}

/**
 * Makes room in a full table: removes the oldest client no grant was
 * approved for, and returns it; undefined when every client is in use.
 */
export function evictOldestUnusedClient(
  dataDir: string,
  clients: readonly OAuthClient[],
): OAuthClient | undefined {
  let oldest: OAuthClient | undefined;
  for (const client of clients) {
    if (client.approvedAt) continue;
    if (
      !oldest ||
      Date.parse(client.registeredAt) < Date.parse(oldest.registeredAt)
    ) {
      oldest = client;
    }
  }
  if (oldest) fs.rmSync(clientFile(dataDir, oldest.clientId), { force: true });
  return oldest;
}

function isClient(value: unknown): value is OAuthClient {
  const v = value as Partial<OAuthClient> | undefined;
  return (
    v?.format === FORMAT &&
    isOAuthClientId(v.clientId) &&
    Array.isArray(v.redirectUris) &&
    v.redirectUris.every((uri) => typeof uri === "string") &&
    typeof v.expiresAt === "string"
  );
}

/** The client file `id` holds, expired or not. */
function readClientFile(dataDir: string, id: string): OAuthClient | undefined {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(clientFile(dataDir, id), "utf8"));
  } catch {
    return undefined;
  }
  return isClient(value) && value.clientId === id ? value : undefined;
}

/** The registered, unexpired client `id`; undefined for any other. */
export function readOAuthClient(
  dataDir: string,
  id: unknown,
  now: number,
): OAuthClient | undefined {
  if (!isOAuthClientId(id)) return undefined;
  const client = readClientFile(dataDir, id);
  return client && Date.parse(client.expiresAt) > now ? client : undefined;
}

export function writeOAuthClient(dataDir: string, client: OAuthClient): void {
  const file = clientFile(dataDir, client.clientId);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (!writeOwnerOnlyFile(file, `${JSON.stringify(client, null, 2)}\n`)) {
    warnNotOwnerOnly(file);
  }
}

/** Every registered client, expired ones removed on the way. */
export function listOAuthClients(dataDir: string, now: number): OAuthClient[] {
  let names: string[];
  try {
    names = fs.readdirSync(clientsDir(dataDir));
  } catch {
    return [];
  }
  const clients: OAuthClient[] = [];
  for (const name of names) {
    const id = /^(phc_[0-9a-f]{32})\.json$/.exec(name)?.[1];
    const client = id ? readClientFile(dataDir, id) : undefined;
    if (!id || !client) continue;
    if (Date.parse(client.expiresAt) > now) clients.push(client);
    else fs.rmSync(clientFile(dataDir, id), { force: true });
  }
  return clients;
}
