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

/** How long a registration holds; a client registers again after. */
export const OAUTH_CLIENT_TTL_MS = 30 * 24 * 60 * 60_000;
/** Redirect URIs one client may register. */
export const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type OAuthClient = {
  format: typeof FORMAT;
  version: 1;
  /** `phc_<32 hex>`. */
  clientId: string;
  /** As the client named itself, shown on the consent page. */
  clientName?: string;
  /** The redirect URIs a code may go to, matched exactly. */
  redirectUris: string[];
  /** Who registered it: the requesting address. */
  registeredFrom: string;
  registeredAt: string;
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
 * any host, or http on loopback (a native app's listener, RFC 8252 7.3), no
 * fragment and no user info.
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
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return undefined;
  return `${uri} is neither https nor http on loopback (localhost, 127.0.0.1, [::1])`;
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
    expiresAt: new Date(o.now + OAUTH_CLIENT_TTL_MS).toISOString(),
  };
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
