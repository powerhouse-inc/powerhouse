import { execFile } from "node:child_process";
import crypto from "node:crypto";

/**
 * Sign-in by link for a Connect served on this computer (F3d): the process
 * that serves Connect holds a secret made at each start, and a link carries a
 * one-time code minted from it in its fragment. The page exchanges the code
 * once, at that process's loopback endpoint, for a credential that names the
 * page's session key, signed with the person's own key. Node builtins only:
 * a Cli mints links on its start path.
 *
 * A code is `nonce(16) | expiresAt(8, ms, big-endian) | mac(16)`, base64url,
 * the mac an HMAC-SHA256 under the secret over nonce, expiry and the origin
 * the link opens. The endpoint keeps the nonces it took, so a code works once.
 */

/** The variable a compound hands its Connect member the secret in. */
export const LOCAL_SIGN_IN_SECRET_ENV = "PH_LOCAL_SIGN_IN_SECRET";

/** The fragment parameter a link carries its code in. */
export const LOCAL_SIGN_IN_PARAM = "ph-sign-in";

/** The endpoint's routes, under Connect's base path. */
export const LOCAL_SIGN_IN_ROUTES = {
  signIn: "__ph/sign-in",
  renew: "__ph/renew",
  unlock: "__ph/unlock",
} as const;

/** How long a code may wait for its exchange. */
export const LOCAL_SIGN_IN_CODE_TTL_MS = 10 * 60_000;

/** The label of the credentials it issues: the app name Connect signs with. */
export const LOCAL_SIGN_IN_LABEL = "connect";

/** How long before its end a credential the endpoint issued is renewed. */
export const LOCAL_SIGN_IN_RENEW_DAYS = 7;

/** Who the page signs as: the person's pseudonym on this computer. */
export type LocalSignInIdentity = {
  kind: "pseudonym";
  address: string;
  /** "Anonymous 0x1a2b...9f3c". */
  label: string;
};

/** A data-folder session the endpoint issued for (the Studio agent). */
export type LocalSignInSession = {
  label: string;
  /** Unset while the store withdrew it: it stays withdrawn. */
  expiresAt?: string;
  withdrawn?: true;
};

/** A credential for the page's session key. */
export type LocalSignInIssued = {
  ok: true;
  /** renown's `PowerhouseVerifiableCredential`. */
  credential: unknown;
  identity: LocalSignInIdentity;
  expiresAt: string;
  /** From when the page renews it. */
  renewFrom: string;
  sessions: LocalSignInSession[];
};

/** Why nothing was issued; `status` is the endpoint's answer. */
export type LocalSignInRefusal = {
  ok: false;
  status: 400 | 401 | 403 | 409 | 423;
  reason:
    | "bad-session"
    | "bad-bearer"
    | "not-issued-here"
    | "withdrawn"
    | "expired"
    | "password-required"
    | "wrong-password"
    | "renown-login"
    | "undeclared-session";
  /** A Renown login's name (`renown-login`). */
  label?: string;
};

/**
 * Issues what the endpoint hands out, as the person's own identity
 * (`@renown/sdk/local-sign-in`). The endpoint checks the request first: the
 * code, the origin, the host.
 */
export interface LocalSignInIssuer {
  /** A credential for `sessionDid`; the code was checked. */
  signIn(o: {
    sessionDid: string;
    password?: string;
  }): Promise<LocalSignInIssued | LocalSignInRefusal>;
  /** A new credential for the session whose bearer carries one issued here. */
  renew(o: {
    bearer: string;
    password?: string;
  }): Promise<LocalSignInIssued | LocalSignInRefusal>;
  /** Unlocks the key for the declared `sessions`, for that bearer's page. */
  unlock(o: {
    bearer: string;
    password: string;
    sessions: readonly string[];
  }): Promise<
    { ok: true; sessions: LocalSignInSession[] } | LocalSignInRefusal
  >;
  /** Renews the declared sessions near their end, while the key is unlocked. */
  renewSessions(): Promise<LocalSignInSession[]>;
}

const NONCE_BYTES = 16;
const MAC_BYTES = 16;
const CODE_BYTES = NONCE_BYTES + 8 + MAC_BYTES;

/** A secret for one start, base64url. */
export function newSignInSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function macOf(
  secret: string,
  nonce: Buffer,
  expiry: Buffer,
  origin: string,
): Buffer {
  return crypto
    .createHmac("sha256", Buffer.from(secret, "base64url"))
    .update(nonce)
    .update(expiry)
    .update(origin)
    .digest()
    .subarray(0, MAC_BYTES);
}

/** The origin a code is bound to: scheme, host and port, lower case. */
export function signInOrigin(url: string): string {
  return new URL(url).origin.toLowerCase();
}

/** A code for a link that opens `origin`, valid for `ttlMs` from `now`. */
export function mintSignInCode(
  secret: string,
  origin: string,
  o: { now?: number; ttlMs?: number } = {},
): string {
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const expiry = Buffer.alloc(8);
  expiry.writeBigUInt64BE(
    BigInt((o.now ?? Date.now()) + (o.ttlMs ?? LOCAL_SIGN_IN_CODE_TTL_MS)),
  );
  const mac = macOf(secret, nonce, expiry, signInOrigin(origin));
  return Buffer.concat([nonce, expiry, mac]).toString("base64url");
}

export type SignInCodeCheck =
  | { ok: true; nonce: string; expiresAt: number }
  | { ok: false; reason: "bad-code" | "expired-code" };

/** Whether `code` was minted under `secret` for `origin` and still holds. */
export function checkSignInCode(
  secret: string,
  code: string,
  origin: string,
  now: number = Date.now(),
): SignInCodeCheck {
  const bytes = /^[A-Za-z0-9_-]+$/.test(code)
    ? Buffer.from(code, "base64url")
    : Buffer.alloc(0);
  if (bytes.length !== CODE_BYTES) return { ok: false, reason: "bad-code" };
  const nonce = bytes.subarray(0, NONCE_BYTES);
  const expiry = bytes.subarray(NONCE_BYTES, NONCE_BYTES + 8);
  const mac = bytes.subarray(NONCE_BYTES + 8);
  const expected = macOf(secret, nonce, expiry, signInOrigin(origin));
  if (!crypto.timingSafeEqual(mac, expected)) {
    return { ok: false, reason: "bad-code" };
  }
  const expiresAt = Number(expiry.readBigUInt64BE());
  if (expiresAt <= now) return { ok: false, reason: "expired-code" };
  return { ok: true, nonce: nonce.toString("base64url"), expiresAt };
}

/** `appUrl` with a fresh code in its fragment. */
export function signInLink(
  appUrl: string,
  secret: string,
  o: { now?: number } = {},
): string {
  const url = new URL(appUrl);
  url.hash = `${LOCAL_SIGN_IN_PARAM}=${mintSignInCode(secret, url.origin, o)}`;
  return url.href;
}

/**
 * Whether to open a link in the browser: as asked, else on a terminal
 * outside CI. `BROWSER=none` turns it off, as it does for Vite.
 */
export function opensBrowser(o: {
  asked?: boolean;
  isTTY?: boolean;
  env?: Readonly<Record<string, string | undefined>>;
}): boolean {
  const env = o.env ?? process.env;
  if (env.BROWSER?.toLowerCase() === "none") return false;
  if (o.asked !== undefined) return o.asked;
  return o.isTTY === true && !env.CI;
}

/** Opens `url` in the default browser; best effort, the printed link stands. */
export function openInBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? // Not `cmd /c start`: cmd ends the command at a `&` of the URL.
          ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  try {
    const child = execFile(command, args, { windowsHide: true }, () => {});
    child.unref();
  } catch {
    // No opener: the printed link stands.
  }
}
