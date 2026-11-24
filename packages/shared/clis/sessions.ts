import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CredentialLike } from "./credential-records.js";
import {
  identityHome,
  readActiveIdentity,
  type IdentityInfo,
} from "./identity.js";
import {
  createOwnerOnlyFile,
  warnNotOwnerOnly,
  writeOwnerOnlyFile,
} from "./owner-only.js";

/**
 * Sessions: the P-256 keys that tools and agents sign actions with. An action
 * is signed by a session key; a credential that the person's identity signs
 * names that key and labels it (`credentialSubject.app`: "vetra",
 * "vetra agent vetra-agent", "mcp claude-code").
 *
 * A person's own tools keep their session in the home folder, per address:
 * `~/.ph/identities/<address>/sessions/<label>.json`. Agents and MCP clients
 * act in one store and keep theirs in its data folder:
 * `<dataDir>/.ph/sessions/<label>.json`. A Renown login's tools use the
 * login's own session key.
 *
 * Node builtins only: reading who signs needs no curve library and no
 * network. Issuing and signing are `@renown/sdk/identity`'s.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** A key as JSON Web Key, the form WebCrypto exports. */
export type JsonWebKey = {
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  [field: string]: unknown;
};

/** Where a session's key is kept. */
export type SessionPlace = "home" | "data-folder";

/** A credential's lifetime as the tools issue it. */
export const SESSION_LIFETIME_DAYS = 30;
/** A credential with less left than this is issued again. */
export const SESSION_RENEW_DAYS = 7;

const FORMAT = "ph-session";

/** What an action's `context.signer` names, apart from its signatures. */
export type SessionSigner = {
  user: { address: string; networkId: string; chainId: number };
  app: { name: string; key: string };
};

export type SessionFile = {
  format: typeof FORMAT;
  version: 1;
  /** What the session asks to be called; the credential's label is signed. */
  label: string;
  /** The session key's did:key. */
  did: string;
  createdAt: string;
  key: { publicKey: JsonWebKey; privateKey: JsonWebKey };
  /** The credential naming the key, once issued. */
  credential?: CredentialLike;
};

/** A label as a file name: lower case, letters, digits and dashes. */
export function sessionSlug(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`"${label}" is no session label.`);
  return slug;
}

/** The file of a session. `address` is the person's, for the home folder. */
export function sessionFilePath(o: {
  place: SessionPlace;
  label: string;
  address: string;
  dataDir: string;
  env?: Env;
}): string {
  const name = `${sessionSlug(o.label)}.json`;
  return o.place === "home"
    ? path.join(
        identityHome(o.env ?? process.env),
        o.address.toLowerCase(),
        "sessions",
        name,
      )
    : path.join(path.resolve(o.dataDir), ".ph", "sessions", name);
}

function isSessionFile(value: unknown): value is SessionFile {
  const v = value as Partial<SessionFile> | undefined;
  return (
    v?.format === FORMAT &&
    typeof v.label === "string" &&
    typeof v.did === "string" &&
    typeof v.key?.publicKey === "object" &&
    typeof v.key.privateKey === "object"
  );
}

/** The session in `file`; undefined when there is none or it is unreadable. */
export function readSessionFile(file: string): SessionFile | undefined {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return undefined;
  }
  return isSessionFile(value) ? value : undefined;
}

function serialize(session: SessionFile): string {
  return `${JSON.stringify(session, null, 2)}\n`;
}

function ensureFolder(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
}

/** Replaces `file` with `session`, owner-only. */
export function writeSessionFile(file: string, session: SessionFile): void {
  ensureFolder(file);
  if (!writeOwnerOnlyFile(file, serialize(session))) warnNotOwnerOnly(file);
}

// -------------------------------------------------------------- did:key

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: Uint8Array): string {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let out = "";
  while (value > 0n) {
    out = BASE58[Number(value % 58n)]! + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/** The did:key of a P-256 public key given as a JWK (multicodec 0x1200). */
export function didOfP256Jwk(jwk: JsonWebKey): string {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
    throw new Error("Not a P-256 public key.");
  }
  const x = Buffer.from(jwk.x, "base64url");
  const y = Buffer.from(jwk.y, "base64url");
  if (x.length !== 32 || y.length !== 32) {
    throw new Error("Not a P-256 public key.");
  }
  const compressed = Buffer.concat([
    Buffer.from([(y[31]! & 1) === 0 ? 0x02 : 0x03]),
    x,
  ]);
  return `did:key:z${base58(Buffer.concat([Buffer.from([0x80, 0x24]), compressed]))}`;
}

/** A new session key, labelled; nothing is written. */
export function newSession(label: string, now = new Date()): SessionFile {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  // The form WebCrypto exports, as renown's key storage keeps it.
  const pub = {
    ...publicKey.export({ format: "jwk" }),
    key_ops: ["verify"],
    ext: true,
  };
  const priv = {
    ...privateKey.export({ format: "jwk" }),
    key_ops: ["sign"],
    ext: true,
  };
  return {
    format: FORMAT,
    version: 1,
    label,
    did: didOfP256Jwk(pub),
    createdAt: now.toISOString(),
    key: { publicKey: pub, privateKey: priv },
  };
}

/**
 * The session in `file`, made when there is none. Of two processes that race,
 * one writes it and both use that one.
 */
export function ensureSessionFile(file: string, label: string): SessionFile {
  const held = readSessionFile(file);
  if (held) return held;
  ensureFolder(file);
  const made = newSession(label);
  const { restricted } = createOwnerOnlyFile(file, serialize(made));
  if (!restricted) warnNotOwnerOnly(file);
  const kept = readSessionFile(file);
  if (!kept) throw new Error(`Could not keep the session key in ${file}.`);
  return kept;
}

// ------------------------------------------------------------ who signs

/** The address a credential's issuer names, lower case. */
function issuerAddress(credential: CredentialLike | undefined): string {
  return credential?.issuer.ethereumAddress.toLowerCase() ?? "";
}

/** Whether `credential` is past its date, or within `days` of it. */
export function credentialEndsWithin(
  credential: CredentialLike | undefined,
  days: number,
  now: number = Date.now(),
): boolean {
  const end = Date.parse(credential?.expirationDate ?? "");
  return !Number.isFinite(end) || end - now <= days * 24 * 60 * 60 * 1000;
}

/** The session file's credential, when it names `address` and has not ended. */
export function sessionCredentialFor(
  session: SessionFile,
  address: string,
  now: number = Date.now(),
): CredentialLike | undefined {
  const { credential } = session;
  if (!credential || issuerAddress(credential) !== address.toLowerCase()) {
    return undefined;
  }
  if (credential.credentialSubject.id !== session.did) return undefined;
  return credentialEndsWithin(credential, 0, now) ? undefined : credential;
}

/** What `context.signer` names for `session` acting as `identity`. */
export function sessionSignerOf(
  identity: Pick<IdentityInfo, "address"> & { chainId?: number },
  session: Pick<SessionFile, "did" | "label" | "credential">,
): SessionSigner {
  return {
    user: {
      address: identity.address,
      networkId: "eip155",
      chainId: identity.chainId ?? 1,
    },
    // The label the credential signs; until there is one, the asked label.
    app: {
      name: session.credential?.credentialSubject.app ?? session.label,
      key: session.did,
    },
  };
}

type StoredLogin = {
  user?: {
    chainId?: number;
    credential?: { credentialSubject?: { app?: string } };
  };
};

/** The Renown login's session key and the label its credential signs. */
function loginSession(
  identity: IdentityInfo,
): Pick<SessionFile, "did" | "label" | "credential"> | undefined {
  const login = identity.renown;
  if (!login || login.expired) return undefined;
  let keyPair: { publicKey?: JsonWebKey } | undefined;
  let stored: StoredLogin | undefined;
  try {
    keyPair = JSON.parse(fs.readFileSync(login.keypairFile, "utf8")) as {
      publicKey?: JsonWebKey;
    };
    stored = JSON.parse(fs.readFileSync(login.file, "utf8")) as StoredLogin;
  } catch {
    return undefined;
  }
  if (!keyPair.publicKey) return undefined;
  let did: string;
  try {
    did = didOfP256Jwk(keyPair.publicKey);
  } catch {
    return undefined;
  }
  return {
    did,
    label: stored?.user?.credential?.credentialSubject?.app ?? "renown-app",
  };
}

/**
 * Who would sign for the session `label` in `dataDir`, from the files only:
 * undefined when nobody is logged in and there is no pseudonym, or the
 * session has no key yet. Makes nothing, asks nothing.
 */
export function peekSessionSigner(o: {
  dataDir: string;
  label: string;
  place: SessionPlace;
  env?: Env;
}): SessionSigner | undefined {
  const env = o.env ?? process.env;
  const identity = readActiveIdentity({ dataDir: o.dataDir, env });
  if (!identity) return undefined;
  if (identity.kind === "renown") {
    if (o.place === "data-folder") {
      const file = sessionFilePath({ ...o, address: identity.address, env });
      const session = readSessionFile(file);
      return session && sessionCredentialFor(session, identity.address)
        ? sessionSignerOf(
            { address: identity.address, chainId: identity.renown?.chainId },
            session,
          )
        : undefined;
    }
    const session = loginSession(identity);
    return session
      ? sessionSignerOf(
          { address: identity.address, chainId: identity.renown?.chainId },
          session,
        )
      : undefined;
  }
  const session = readSessionFile(
    sessionFilePath({ ...o, address: identity.address, env }),
  );
  if (!session) return undefined;
  return sessionSignerOf(identity, {
    ...session,
    credential: sessionCredentialFor(session, identity.address),
  });
}
