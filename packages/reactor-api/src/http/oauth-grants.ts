import {
  warnNotOwnerOnly,
  writeOwnerOnlyFile,
} from "@powerhousedao/shared/clis/owner-only";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * The pending grants of the OAuth device flow (RFC 8628), one file each in
 * the store's data folder, `<dataDir>/.ph/oauth/grants/<id>.json`, so every
 * replica on the folder serves them. A grant names the host session the host
 * made for it; the person approves the session's key with a credential, and
 * the client's next poll is issued a token for it. The id is the first 32 hex
 * of the sha256 of the device code: the code itself is kept nowhere.
 *
 * An authorization code grant (an MCP client's sign-in) is the same grant
 * with its `code` part; once approved and its code issued, it is kept under
 * the code's hash instead, so the token request takes it as a poll takes a
 * device grant: once.
 */

/** What a person types: 8 of these, shown `WXYZ-BCDF` (about 34 bits). */
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const USER_CODE_LENGTH = 8;

/** How long a person has to approve a grant. */
export const DEVICE_GRANT_TTL_MS = 10 * 60_000;
/** How often a client may poll, in seconds; `slow_down` adds 5. */
export const DEVICE_POLL_INTERVAL_S = 5;
/** How long a page's nonce holds. */
const NONCE_TTL_MS = DEVICE_GRANT_TTL_MS;

const FORMAT = "ph-oauth-grant";

export type DeviceGrantStatus = "pending" | "approved" | "denied";

/** How long an authorization code may be exchanged, once issued. */
export const AUTHORIZATION_CODE_TTL_MS = 60_000;

/**
 * The authorization code grant's own part (RFC 6749 4.1, RFC 7636, RFC 8707):
 * the registered client that asked, where its code goes, and the PKCE
 * challenge the token request must answer. The rest of the grant (its user
 * code, session and consent) is the device grant's.
 */
export type CodeGrantRequest = {
  /** The registered client (`phc_...`). */
  clientId: string;
  /** The redirect URI the code goes to, one the client registered. */
  redirectUri: string;
  /** base64url(sha256(code_verifier)). */
  codeChallenge: string;
  state?: string;
  /** The resource the token is for, on this host. */
  resource?: string;
  /**
   * sha256 (hex) of the key of the consent page's continue link, made at
   * `authorize` and written only into that page: whoever else knows the user
   * code (`device/pending` shows the grant to anyone with it) cannot take the
   * code from `authorize/continue`.
   */
  continueKeyHash?: string;
  /** When the code was issued: the grant then lives under the code's hash. */
  issuedAt?: string;
};

export type DeviceGrant = {
  format: typeof FORMAT;
  version: 1;
  /** sha256(device_code), 32 hex. */
  id: string;
  /** The user code, as typed: 8 letters, no dash. */
  userCode: string;
  /** The host session the grant approves, and its key. */
  sessionId: string;
  sessionDid: string;
  /** The label the credential is to sign. */
  label: string;
  scope: string;
  /** How long the session may run once approved. */
  days: number;
  clientId: string;
  /** Who asked: the requesting address and when. */
  requestedFrom: string;
  requestedAt: string;
  expiresAt: string;
  status: DeviceGrantStatus;
  /** Who approved it. */
  address?: string;
  /** Signs the consent page's nonces (hex). */
  nonceKey: string;
  /** A Renown console session the person was sent to, if any. */
  renownSession?: string;
  /** Set for an authorization code grant (an MCP client's sign-in). */
  code?: CodeGrantRequest;
};

export function oauthGrantsDir(dataDir: string): string {
  return path.join(dataDir, ".ph", "oauth", "grants");
}

function grantFile(dataDir: string, id: string): string {
  return path.join(oauthGrantsDir(dataDir), `${id}.json`);
}

/** The grant id of a device code: the first 32 hex of its sha256. */
export function grantIdOf(deviceCode: string): string {
  return createHash("sha256").update(deviceCode).digest("hex").slice(0, 32);
}

/** A new device code: 32 random bytes, base64url. */
export function newDeviceCode(): string {
  return randomBytes(32).toString("base64url");
}

/** A new user code: 8 letters of an alphabet without vowels or look-alikes. */
export function newUserCode(): string {
  let code = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    code += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  }
  return code;
}

/** A user code as typed (any case, dashes, spaces) in its kept form; undefined when it cannot be one. */
export function normalizeUserCode(typed: unknown): string | undefined {
  if (typeof typed !== "string") return undefined;
  const code = typed.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== USER_CODE_LENGTH) return undefined;
  for (const char of code) {
    if (!USER_CODE_ALPHABET.includes(char)) return undefined;
  }
  return code;
}

/** base64url(sha256(verifier)): PKCE's S256 (RFC 7636 4.2). */
export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Whether `verifier` answers the S256 `challenge`, compared in constant time. */
export function verifierHolds(challenge: string, verifier: unknown): boolean {
  // RFC 7636 4.1: 43 to 128 unreserved characters.
  if (
    typeof verifier !== "string" ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
  ) {
    return false;
  }
  const expected = Buffer.from(challenge);
  const given = Buffer.from(s256(verifier));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A new key for a consent page's continue link, and the hash kept of it. */
export function newContinueKey(): { key: string; hash: string } {
  const key = randomBytes(32).toString("base64url");
  return { key, hash: createHash("sha256").update(key).digest("hex") };
}

/** Whether `key` is the continue key of `request`, compared in constant time. */
export function continueKeyHolds(
  request: CodeGrantRequest,
  key: unknown,
): boolean {
  if (typeof key !== "string" || !request.continueKeyHash) return false;
  const expected = Buffer.from(request.continueKeyHash, "hex");
  const given = createHash("sha256").update(key).digest();
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** `WXYZ-BCDF`. */
export function formatUserCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function newDeviceGrant(o: {
  deviceCode: string;
  userCode: string;
  sessionId: string;
  sessionDid: string;
  label: string;
  scope: string;
  days: number;
  clientId: string;
  requestedFrom: string;
  now: number;
  code?: CodeGrantRequest;
}): DeviceGrant {
  return {
    ...(o.code ? { code: o.code } : {}),
    format: FORMAT,
    version: 1,
    id: grantIdOf(o.deviceCode),
    userCode: o.userCode,
    sessionId: o.sessionId,
    sessionDid: o.sessionDid,
    label: o.label,
    scope: o.scope,
    days: o.days,
    clientId: o.clientId,
    requestedFrom: o.requestedFrom,
    requestedAt: new Date(o.now).toISOString(),
    expiresAt: new Date(o.now + DEVICE_GRANT_TTL_MS).toISOString(),
    status: "pending",
    nonceKey: randomBytes(32).toString("hex"),
  };
}

function isGrant(value: unknown): value is DeviceGrant {
  const v = value as Partial<DeviceGrant> | undefined;
  return (
    v?.format === FORMAT &&
    typeof v.id === "string" &&
    typeof v.userCode === "string" &&
    typeof v.sessionId === "string" &&
    typeof v.expiresAt === "string" &&
    typeof v.nonceKey === "string"
  );
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

export function readDeviceGrant(
  dataDir: string,
  id: string,
): DeviceGrant | undefined {
  if (!/^[0-9a-f]{32}$/.test(id)) return undefined;
  const value = readJson(grantFile(dataDir, id));
  return isGrant(value) && value.id === id ? value : undefined;
}

export function writeDeviceGrant(dataDir: string, grant: DeviceGrant): void {
  const file = grantFile(dataDir, grant.id);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (!writeOwnerOnlyFile(file, `${JSON.stringify(grant, null, 2)}\n`)) {
    warnNotOwnerOnly(file);
  }
}

export function removeDeviceGrant(dataDir: string, id: string): void {
  if (!/^[0-9a-f]{32}$/.test(id)) return;
  fs.rmSync(grantFile(dataDir, id), { force: true });
}

/**
 * Takes the grant for issuing: of two polls that race, one moves the file
 * aside and issues, the other finds it gone. Returns the grant taken.
 */
export function takeDeviceGrant(
  dataDir: string,
  id: string,
): DeviceGrant | undefined {
  const file = grantFile(dataDir, id);
  const taken = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.issuing`;
  try {
    fs.renameSync(file, taken);
  } catch {
    return undefined;
  }
  try {
    const value = readJson(taken);
    return isGrant(value) && value.id === id ? value : undefined;
  } finally {
    fs.rmSync(taken, { force: true });
  }
}

/** Every grant on file, expired ones included. */
export function listDeviceGrants(dataDir: string): DeviceGrant[] {
  const dir = oauthGrantsDir(dataDir);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .map((name) => /^([0-9a-f]{32})\.json$/.exec(name)?.[1])
    .filter((id): id is string => id !== undefined)
    .map((id) => readDeviceGrant(dataDir, id))
    .filter((grant): grant is DeviceGrant => grant !== undefined);
}

/** The unexpired grant whose user code `code` is (kept form). */
export function findDeviceGrant(
  dataDir: string,
  code: string,
  now: number,
): DeviceGrant | undefined {
  return listDeviceGrants(dataDir).find(
    (grant) => grant.userCode === code && Date.parse(grant.expiresAt) > now,
  );
}

// ------------------------------------------------------------------ nonces

/**
 * A nonce for a page about `grant`, valid until it or the grant ends:
 * `<until>.<hmac>`, signed with the grant's own key, so it needs no store.
 */
export function grantNonce(grant: DeviceGrant, now: number): string {
  const until = Math.min(now + NONCE_TTL_MS, Date.parse(grant.expiresAt));
  return `${until}.${nonceMac(grant, until)}`;
}

export function grantNonceHolds(
  grant: DeviceGrant,
  nonce: unknown,
  now: number,
): boolean {
  if (typeof nonce !== "string") return false;
  const [until, mac] = nonce.split(".");
  const at = Number(until);
  if (!Number.isInteger(at) || at <= now || !mac) return false;
  const expected = Buffer.from(nonceMac(grant, at), "base64url");
  const given = Buffer.from(mac, "base64url");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function nonceMac(grant: DeviceGrant, until: number): string {
  return createHmac("sha256", Buffer.from(grant.nonceKey, "hex"))
    .update(`${grant.id}|${until}`)
    .digest("base64url");
}
