import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CredentialLike } from "./credential-records.js";
import { warnNotOwnerOnly, writeOwnerOnlyFile } from "./owner-only.js";
import { newSession, type JsonWebKey } from "./sessions.js";

/**
 * Host sessions: a session key a host keeps for a caller who delegated it.
 * The caller authorizes the key with the usual credential (their identity
 * signs it, naming the key and a label) and gets an access token; the host
 * then signs that caller's document writes with the session's key, so an
 * operation reads "session <label> acting for <address>". Document writes
 * only: a host session administers nothing.
 *
 * One file per session in the store's data folder, owner-only:
 * `<dataDir>/.ph/host-sessions/<id>.json`. It holds the session's private
 * key and the hashes of its tokens, never a token: a token is shown once,
 * when it is issued. The credential's record (`source: "host-session"`) is
 * kept beside the others (`.ph/credentials/`), so withdrawing it is the same
 * withdrawal as `ph credentials withdraw`.
 *
 * A token is `phs_<id>_<secret>`: the session's id (32 hex) and 32 random
 * bytes, base64url. The prefix tells a host's door it is no self-signed
 * bearer, and lets secret scanners find a leaked one. At rest only the
 * sha256 of the secret is kept: the secret has 256 bits, so a slow hash adds
 * nothing.
 *
 * Node builtins only: the host verifies and signs; `ph token` reads these
 * files to list and withdraw.
 */

/** What every host session token starts with. */
export const HOST_SESSION_TOKEN_PREFIX = "phs_";

/** The one scope a host session holds: it signs document changes. */
export const HOST_SESSION_SCOPE = "documents:write";

/** The longest a host session lives, whatever was asked. */
export const HOST_SESSION_MAX_DAYS = 30;

/** How a host session was granted: the OAuth device grant (RFC 8628). */
export type HostSessionGrant = "device";

/** A token of the session, as the file keeps it. */
export type HostSessionToken = {
  /** sha256 of the token's secret, hex. */
  hash: string;
  expiresAt: string;
};

const FORMAT = "ph-host-session";

export type HostSessionFile = {
  format: typeof FORMAT;
  version: 1;
  /** 32 hex; the token names it. */
  id: string;
  /** What the session asked to be called; the credential signs the label it acts under. */
  label: string;
  /** The session key's did:key. */
  did: string;
  key: { publicKey: JsonWebKey; privateKey: JsonWebKey };
  scope: string;
  grant: HostSessionGrant;
  /** The OAuth client that asked for it, as it named itself (shown only). */
  clientId: string;
  /** The credential naming the key, once the caller approved the session. */
  credential?: CredentialLike;
  /** Who the session acts for, once approved: the credential's issuer. */
  address?: string;
  chainId?: number;
  tokens: HostSessionToken[];
  createdAt: string;
  approvedAt?: string;
  /** The session's end, once approved: its tokens end with it. */
  expiresAt?: string;
  /** When a token of it last opened the door; written at most hourly. */
  lastUsedAt?: string;
};

/** `<dataDir>/.ph/host-sessions`. */
export function hostSessionsDir(dataDir: string): string {
  return path.join(dataDir, ".ph", "host-sessions");
}

/** A host session's id: 32 lower-case hex. */
export function isHostSessionId(id: string): boolean {
  return /^[0-9a-f]{32}$/.test(id);
}

export function hostSessionFile(dataDir: string, id: string): string {
  if (!isHostSessionId(id)) throw new Error(`"${id}" is no host session id.`);
  return path.join(hostSessionsDir(dataDir), `${id}.json`);
}

/** The first 8 of the id: all a log line names of a session. */
export function shortHostSessionId(id: string): string {
  return id.slice(0, 8);
}

/** A new host session: a fresh key, labelled, approved by nobody yet. Nothing is written. */
export function newHostSession(o: {
  label: string;
  clientId: string;
  grant: HostSessionGrant;
  scope?: string;
  now?: Date;
}): HostSessionFile {
  const now = o.now ?? new Date();
  const session = newSession(o.label, now);
  return {
    format: FORMAT,
    version: 1,
    id: randomBytes(16).toString("hex"),
    label: o.label,
    did: session.did,
    key: session.key,
    scope: o.scope ?? HOST_SESSION_SCOPE,
    grant: o.grant,
    clientId: o.clientId,
    tokens: [],
    createdAt: now.toISOString(),
  };
}

function isHostSessionFile(value: unknown): value is HostSessionFile {
  const v = value as Partial<HostSessionFile> | undefined;
  return (
    v?.format === FORMAT &&
    typeof v.id === "string" &&
    isHostSessionId(v.id) &&
    typeof v.label === "string" &&
    typeof v.did === "string" &&
    typeof v.key?.publicKey === "object" &&
    typeof v.key.privateKey === "object" &&
    Array.isArray(v.tokens)
  );
}

/** The session `id` in `dataDir`; undefined when there is none or it is unreadable. */
export function readHostSession(o: {
  dataDir: string;
  id: string;
}): HostSessionFile | undefined {
  if (!isHostSessionId(o.id)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(
      fs.readFileSync(hostSessionFile(o.dataDir, o.id), "utf8"),
    ) as unknown;
  } catch {
    return undefined;
  }
  return isHostSessionFile(value) && value.id === o.id ? value : undefined;
}

/** Replaces the session's file with `session`, owner-only. */
export function writeHostSession(
  dataDir: string,
  session: HostSessionFile,
): void {
  const file = hostSessionFile(dataDir, session.id);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (!writeOwnerOnlyFile(file, `${JSON.stringify(session, null, 2)}\n`)) {
    warnNotOwnerOnly(file);
  }
}

/** Removes the session's file; its key and tokens go with it. */
export function removeHostSession(o: { dataDir: string; id: string }): void {
  if (!isHostSessionId(o.id)) return;
  fs.rmSync(hostSessionFile(o.dataDir, o.id), { force: true });
}

/** Every host session in `dataDir`, oldest first; other files are skipped. */
export function listHostSessions(o: { dataDir: string }): HostSessionFile[] {
  const dir = hostSessionsDir(o.dataDir);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .map((name) => /^([0-9a-f]{32})\.json$/.exec(name)?.[1])
    .filter((id): id is string => id !== undefined)
    .map((id) => readHostSession({ dataDir: o.dataDir, id }))
    .filter((session): session is HostSessionFile => session !== undefined)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------------------------------------------------------------- tokens

/** The hash a session keeps of a token's secret: sha256, hex. */
export function hostSessionSecretHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * A new token of session `id`: the token, to show once, and the hash to keep.
 * Nothing is written.
 */
export function mintHostSessionToken(id: string): {
  token: string;
  hash: string;
} {
  if (!isHostSessionId(id)) throw new Error(`"${id}" is no host session id.`);
  const secret = randomBytes(32).toString("base64url");
  return {
    token: `${HOST_SESSION_TOKEN_PREFIX}${id}_${secret}`,
    hash: hostSessionSecretHash(secret),
  };
}

/** Whether a bearer is a host session token rather than a self-signed one. */
export function isHostSessionToken(token: string | undefined): boolean {
  return token?.startsWith(HOST_SESSION_TOKEN_PREFIX) ?? false;
}

/** The token in an `Authorization` header, when it is a host session's. */
export function hostSessionTokenOf(
  authorization: string | undefined,
): string | undefined {
  const token = authorization?.split(" ")[1];
  return isHostSessionToken(token) ? token : undefined;
}

/** The session id and secret a token names; undefined for anything malformed. */
export function parseHostSessionToken(
  token: string,
): { id: string; secret: string } | undefined {
  const found = /^phs_([0-9a-f]{32})_([A-Za-z0-9_-]{43})$/.exec(token);
  return found ? { id: found[1], secret: found[2] } : undefined;
}

/**
 * The session's token whose hash is the secret's, compared in constant time;
 * undefined when none is. Expiry is the caller's to check.
 */
export function matchHostSessionToken(
  session: Pick<HostSessionFile, "tokens">,
  secret: string,
): HostSessionToken | undefined {
  const hash = Buffer.from(hostSessionSecretHash(secret), "hex");
  let found: HostSessionToken | undefined;
  for (const token of session.tokens) {
    const held = Buffer.from(token.hash, "hex");
    if (held.length === hash.length && timingSafeEqual(held, hash)) {
      found = token;
    }
  }
  return found;
}

/** When the session ends: its own end, else its credential's; undefined before approval. */
export function hostSessionEnd(
  session: Pick<HostSessionFile, "expiresAt" | "credential">,
): number | undefined {
  const ends = [session.expiresAt, session.credential?.expirationDate]
    .map((date) => (date === undefined ? Number.NaN : Date.parse(date)))
    .filter((at) => Number.isFinite(at));
  return ends.length > 0 ? Math.min(...ends) : undefined;
}
