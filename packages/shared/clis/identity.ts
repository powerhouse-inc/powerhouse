import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createOwnerOnlyFile,
  warnNotOwnerOnly,
  writeOwnerOnlyFile,
} from "./owner-only.js";

/**
 * The person's identities on this computer. Logged in with Renown, or else a
 * pseudonym: an Ethereum key made without a login, shown as "Anonymous" and a
 * short address. The pseudonym is kept in the data folder, which travels with
 * the store (`<dataDir>/.ph/.pseudonym.json`), and the same file in the home
 * folder (`~/.ph/identities/<address>/.pseudonym.json`), so a new store reuses
 * it. The Renown login is in the home folder only.
 *
 * Reading needs no password, no network and no curve library: the address is
 * in clear. Signing is `@renown/sdk/identity`'s.
 */

type Env = Readonly<Record<string, string | undefined>>;

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** Names another folder than `~/.ph/identities` (tests, a second user root). */
export const IDENTITY_HOME_ENV = "PH_IDENTITY_HOME";
/** A pseudonym's key as hex: used as is and never written (containers, CI). */
export const IDENTITY_KEY_ENV = "PH_IDENTITY_KEY";
/** The pseudonym's password where no one can be asked. */
export const IDENTITY_PASSWORD_ENV = "PH_IDENTITY_PASSWORD";

const PSEUDONYM_FILE = ".pseudonym.json";

/** The OS user's identities folder. */
export function identityHome(env: Env = process.env): string {
  const given = env[IDENTITY_HOME_ENV];
  return path.resolve(given || path.join(os.homedir(), ".ph", "identities"));
}

/** The data folder of a project: PH_USER_DATA_DIR when set, else the project. */
export function identityDataDir(
  projectDir: string = process.cwd(),
  env: Env = process.env,
): string {
  return path.resolve(env.PH_USER_DATA_DIR ?? projectDir);
}

/** Where the Renown login is: the files `ph login` writes. */
export function loginPaths(env: Env = process.env): {
  dir: string;
  keypair: string;
  file: string;
} {
  const dir = path.join(identityHome(env), "renown");
  return {
    dir,
    keypair: path.join(dir, ".keypair.json"),
    file: path.join(dir, ".renown.json"),
  };
}

/** A data folder's pseudonym file. */
export function dataPseudonymFile(dataDir: string): string {
  return path.join(dataDir, ".ph", PSEUDONYM_FILE);
}

/** The home folder's copy of a pseudonym. */
export function homePseudonymFile(
  address: Address,
  env: Env = process.env,
): string {
  return path.join(identityHome(env), address.toLowerCase(), PSEUDONYM_FILE);
}

const defaultFile = (env: Env) => path.join(identityHome(env), "default.json");
const copiesFile = (address: Address, env: Env) =>
  path.join(identityHome(env), address.toLowerCase(), "copies.json");

// ------------------------------------------------------------------ the key

/** The secp256k1 group order: a private key is in [1, N). */
const N = BigInt(
  "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
);

const hexOf = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytesOf = (hex: string) => Buffer.from(hex.replace(/^0x/, ""), "hex");

/** The EIP-55 form of a 20-byte hex address. */
export function checksumAddress(address: string): Address {
  const lower = address.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(lower)) {
    throw new Error(`Not an Ethereum address: ${address}`);
  }
  const hash = hexOf(keccak_256(new TextEncoder().encode(lower)));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i]!, 16) >= 8 ? lower[i]!.toUpperCase() : lower[i];
  }
  return out as Address;
}

function assertPrivateKey(key: Uint8Array): void {
  const value = key.length === 32 ? BigInt(`0x${hexOf(key)}`) : 0n;
  if (value <= 0n || value >= N) {
    throw new Error("Not a secp256k1 private key.");
  }
}

/** The address of a private key: keccak of its public key, last 20 bytes. */
export function addressOfKey(privateKey: Uint8Array): Address {
  assertPrivateKey(privateKey);
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(privateKey));
  const publicKey = ecdh.getPublicKey(undefined, "uncompressed");
  return checksumAddress(hexOf(keccak_256(publicKey.subarray(1)).slice(-20)));
}

/** A new private key. */
export function generatePrivateKey(): Uint8Array {
  for (;;) {
    const key = new Uint8Array(randomBytes(32));
    try {
      assertPrivateKey(key);
      return key;
    } catch {
      // Out of range: about one in 2^128.
    }
  }
}

/** A private key from hex, as `PH_IDENTITY_KEY` gives it. */
export function parsePrivateKey(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error("Not a private key: 32 bytes of hex expected.");
  }
  const key = new Uint8Array(bytesOf(clean));
  assertPrivateKey(key);
  return key;
}

// ------------------------------------------------- Web3 Secret Storage v3

export type KdfParams = { n: number; r: number; p: number; dklen: number };

/** What the desktop writes: the keystore standard's own defaults. */
export const DEFAULT_KDF: KdfParams = { n: 262144, r: 8, p: 1, dklen: 32 };

/** A key encrypted as geth, Foundry, MetaMask and ethers read it. */
export type V3Keystore = {
  version: 3;
  id: string;
  address: string;
  crypto: {
    cipher: "aes-128-ctr";
    cipherparams: { iv: string };
    ciphertext: string;
    kdf: "scrypt";
    kdfparams: KdfParams & { salt: string };
    mac: string;
  };
};

export class WrongPasswordError extends Error {
  constructor() {
    super("That password does not unlock this key.");
    this.name = "WrongPasswordError";
  }
}

function derive(
  password: string,
  salt: Buffer,
  { n, r, p, dklen }: KdfParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Node allows 32 MB by default; these parameters need 128 * n * r.
    const maxmem = 256 * n * r + 32 * 1024 * 1024;
    scrypt(
      password.normalize("NFKC"),
      salt,
      dklen,
      { N: n, r, p, maxmem },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

const macOf = (derived: Buffer, ciphertext: Buffer) =>
  hexOf(keccak_256(Buffer.concat([derived.subarray(16, 32), ciphertext])));

export async function encryptKeyV3(
  privateKey: Uint8Array,
  password: string,
  kdf: KdfParams = DEFAULT_KDF,
): Promise<V3Keystore> {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const derived = await derive(password, salt, kdf);
  const cipher = createCipheriv("aes-128-ctr", derived.subarray(0, 16), iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(privateKey)),
    cipher.final(),
  ]);
  return {
    version: 3,
    id: randomUUID(),
    address: addressOfKey(privateKey).slice(2).toLowerCase(),
    crypto: {
      cipher: "aes-128-ctr",
      cipherparams: { iv: hexOf(iv) },
      ciphertext: hexOf(ciphertext),
      kdf: "scrypt",
      kdfparams: { ...kdf, salt: hexOf(salt) },
      mac: macOf(derived, ciphertext),
    },
  };
}

export async function decryptKeyV3(
  keystore: V3Keystore,
  password: string,
): Promise<Uint8Array> {
  // Some wallets write the field as `Crypto`.
  const crypto =
    keystore.crypto ??
    (keystore as unknown as { Crypto: V3Keystore["crypto"] }).Crypto;
  if (crypto.kdf !== "scrypt" || crypto.cipher !== "aes-128-ctr") {
    throw new Error(`Cannot read a ${crypto.kdf} / ${crypto.cipher} key.`);
  }
  const { salt, ...kdf } = crypto.kdfparams;
  const derived = await derive(password, bytesOf(salt), kdf);
  const ciphertext = bytesOf(crypto.ciphertext);
  const mac = bytesOf(macOf(derived, ciphertext));
  const expected = bytesOf(crypto.mac);
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    throw new WrongPasswordError();
  }
  const decipher = createDecipheriv(
    "aes-128-ctr",
    derived.subarray(0, 16),
    bytesOf(crypto.cipherparams.iv),
  );
  return new Uint8Array(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]),
  );
}

// ------------------------------------------------------- the pseudonym file

export type PseudonymKey =
  | { type: "plain"; privateKey: Hex }
  | { type: "v3"; keystore: V3Keystore };

export type PseudonymFile = {
  format: "ph-pseudonym";
  version: 1;
  address: Address;
  createdAt: string;
  key: PseudonymKey;
};

/** Reads a pseudonym file, or a bare v3 keystore (the desktop's local key). */
export function parsePseudonymFile(
  text: string,
  file = "the key file",
): PseudonymFile {
  const json = JSON.parse(text) as {
    format?: unknown;
    version?: unknown;
    address?: string;
    key?: PseudonymKey;
    crypto?: unknown;
    Crypto?: unknown;
  };
  if (json.format === "ph-pseudonym") {
    if (json.version !== 1) {
      throw new Error(
        `${file} is version ${String(json.version)}; this Powerhouse reads version 1.`,
      );
    }
    if (!json.address || !json.key) throw new Error(`${file} is incomplete.`);
    return {
      ...(json as PseudonymFile),
      address: checksumAddress(json.address),
    };
  }
  if (json.version === 3 && (json.crypto || json.Crypto) && json.address) {
    return {
      format: "ph-pseudonym",
      version: 1,
      address: checksumAddress(json.address),
      createdAt: "",
      key: { type: "v3", keystore: json as unknown as V3Keystore },
    };
  }
  throw new Error(`${file} holds no pseudonym.`);
}

export function serializePseudonymFile(file: PseudonymFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

function readText(file: string): string | undefined {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}

function readJson<T>(file: string): T | undefined {
  const text = readText(file);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/** The pseudonym in `file`, or undefined when there is none. */
export function readPseudonymFile(file: string): PseudonymFile | undefined {
  const text = readText(file);
  return text === undefined ? undefined : parsePseudonymFile(text, file);
}

async function pseudonymFileOf(
  privateKey: Uint8Array,
  password: string | undefined,
  createdAt: string,
  kdf?: KdfParams,
): Promise<PseudonymFile> {
  return {
    format: "ph-pseudonym",
    version: 1,
    address: addressOfKey(privateKey),
    createdAt,
    key: password
      ? { type: "v3", keystore: await encryptKeyV3(privateKey, password, kdf) }
      : { type: "plain", privateKey: `0x${hexOf(privateKey)}` },
  };
}

// --------------------------------------------------------- what is active

export interface LoginInfo {
  address: Address;
  chainId: number;
  /** The user's did:pkh. */
  did: string;
  label: string;
  /** The credential's id, which Renown withdraws it by. */
  credentialId?: string;
  expiresAt?: string;
  /** Past its date: nothing signs with it (log in again, or log out). */
  expired: boolean;
  file: string;
  keypairFile: string;
}

export interface IdentityInfo {
  kind: "renown" | "pseudonym";
  address: Address;
  label: string;
  /** `home`: no pseudonym in this store yet; the one a signature would copy in. */
  source: "env" | "data-folder" | "home";
  file?: string;
  encrypted?: boolean;
  /** This store's pseudonym is not the home folder's default: that one. */
  differsFromHome?: Address;
  renown?: LoginInfo;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function pseudonymLabel(address: string): string {
  return `Anonymous ${shortAddress(address)}`;
}

type StoredUser = {
  address?: string;
  chainId?: number;
  did?: string;
  credential?: { id?: string; expirationDate?: string };
  profile?: { username?: string | null };
  ens?: { name?: string };
};

/** The Renown login in the home folder, when there is one. */
export function readLogin(
  env: Env = process.env,
  now: number = Date.now(),
): LoginInfo | undefined {
  return readLoginFile(loginPaths(env), now);
}

/**
 * The Renown login kept in `paths.file` with its session key in
 * `paths.keypair`: the home folder's, or one a project or an agent kept
 * before Powerhouse 6.4. Undefined when the file holds no user.
 */
export function readLoginFile(
  paths: { file: string; keypair: string },
  now: number = Date.now(),
): LoginInfo | undefined {
  const user = readJson<{ user?: StoredUser }>(paths.file)?.user;
  if (!user?.address || !user.credential) return undefined;
  let address: Address;
  try {
    address = checksumAddress(user.address);
  } catch {
    return undefined;
  }
  const expiresAt = user.credential.expirationDate;
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
  return {
    address,
    chainId: user.chainId ?? 1,
    did: user.did ?? "",
    label: user.profile?.username || user.ens?.name || shortAddress(address),
    ...(user.credential.id ? { credentialId: user.credential.id } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    expired: Number.isFinite(expiry) && expiry <= now,
    file: paths.file,
    keypairFile: paths.keypair,
  };
}

function homeDefault(env: Env): Address | undefined {
  const pointer = readJson<{ pseudonym?: string }>(defaultFile(env));
  if (!pointer?.pseudonym) return undefined;
  const address = checksumAddress(pointer.pseudonym);
  return fs.existsSync(homePseudonymFile(address, env)) ? address : undefined;
}

function infoOf(
  pseudonym: PseudonymFile,
  source: IdentityInfo["source"],
  file: string,
): IdentityInfo {
  return {
    kind: "pseudonym",
    address: pseudonym.address,
    label: pseudonymLabel(pseudonym.address),
    source,
    file,
    encrypted: pseudonym.key.type === "v3",
  };
}

/**
 * The pseudonym that acts in `dataDir`, without making one: the key in
 * `PH_IDENTITY_KEY`, else the store's own, else the home folder's default
 * (which a signature would copy in). With no `dataDir` (a command outside any
 * store), the key or the home folder's default.
 */
export function readPseudonym(opts: {
  dataDir?: string;
  env?: Env;
}): IdentityInfo | undefined {
  const env = opts.env ?? process.env;
  const given = env[IDENTITY_KEY_ENV];
  if (given) {
    let address: Address;
    try {
      address = addressOfKey(parsePrivateKey(given));
    } catch (error) {
      throw new Error(`${IDENTITY_KEY_ENV}: ${(error as Error).message}`, {
        cause: error,
      });
    }
    return {
      kind: "pseudonym",
      address,
      label: pseudonymLabel(address),
      source: "env",
      encrypted: false,
    };
  }
  const home = homeDefault(env);
  if (opts.dataDir !== undefined) {
    const dataFile = dataPseudonymFile(opts.dataDir);
    const own = readPseudonymFile(dataFile);
    if (own) {
      const info = infoOf(own, "data-folder", dataFile);
      return home && home !== own.address
        ? { ...info, differsFromHome: home }
        : info;
    }
  }
  if (!home) return undefined;
  const homeFile = homePseudonymFile(home, env);
  const pseudonym = readPseudonymFile(homeFile);
  return pseudonym ? infoOf(pseudonym, "home", homeFile) : undefined;
}

/**
 * Who acts here: the key in `PH_IDENTITY_KEY` when it is set (a service's
 * identity, given to this process alone), else the Renown login when there is
 * one (expired included, so signing can refuse it), else the pseudonym.
 * Never makes a key, never asks, never goes to the network. With no
 * `dataDir`, a pseudonym is the home folder's.
 */
export function readActiveIdentity(opts: {
  dataDir?: string;
  env?: Env;
}): IdentityInfo | undefined {
  const env = opts.env ?? process.env;
  if (env[IDENTITY_KEY_ENV]) return readPseudonym({ ...opts, env });
  const login = readLogin(env);
  if (login) {
    return {
      kind: "renown",
      address: login.address,
      label: login.label,
      source: "home",
      file: login.file,
      renown: login,
    };
  }
  return readPseudonym(opts);
}

// ------------------------------------------------------ making and copying

function inProfile(file: string): boolean {
  const relative = path.relative(os.homedir(), file);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

/** Writes a key file owner-only; a plain key nobody else may read. */
function keepKeyFile(
  file: string,
  text: string,
  plain: boolean,
  create: boolean,
  env: Env,
): boolean {
  const dir = path.dirname(file);
  // The identities folder is the user's alone; a data folder keeps its mode.
  const relative = path.relative(identityHome(env), dir);
  const own = !relative.startsWith("..") && !path.isAbsolute(relative);
  fs.mkdirSync(dir, { recursive: true, ...(own ? { mode: 0o700 } : {}) });
  let created = true;
  let restricted: boolean;
  if (create) {
    ({ created, restricted } = createOwnerOnlyFile(file, text));
  } else {
    restricted = writeOwnerOnlyFile(file, text);
  }
  if (created && !restricted) {
    if (plain && !inProfile(file)) {
      fs.rmSync(file, { force: true });
      throw new Error(
        `Could not limit ${file} to your user, and it would hold an unencrypted key outside your profile. ` +
          `Set a password (${IDENTITY_PASSWORD_ENV}) or move the data folder into your profile.`,
      );
    }
    warnNotOwnerOnly(file);
  }
  return created;
}

/** `.ph/.gitignore` with `*`: the folder's keys stay out of git. */
function ignoreDataFolder(dataDir: string): void {
  const file = path.join(dataDir, ".ph", ".gitignore");
  try {
    fs.writeFileSync(file, "*\n", { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

type Copies = { version: 1; dataDirs: string[] };

/** The data folders a pseudonym was copied into, so a new password reaches them. */
export function pseudonymCopies(address: Address, env: Env = process.env) {
  return readJson<Copies>(copiesFile(address, env))?.dataDirs ?? [];
}

function recordCopy(address: Address, dataDir: string, env: Env): void {
  const listed = pseudonymCopies(address, env);
  const folder = path.resolve(dataDir);
  const same = (a: string) =>
    process.platform === "win32"
      ? a.toLowerCase() === folder.toLowerCase()
      : a === folder;
  if (listed.some(same)) return;
  const copies: Copies = { version: 1, dataDirs: [...listed, folder] };
  writeOwnerOnlyFile(
    copiesFile(address, env),
    `${JSON.stringify(copies, null, 2)}\n`,
  );
}

export interface EnsurePseudonymOptions {
  /** The store; none for a command outside any store (the home folder's alone). */
  dataDir?: string;
  env?: Env;
  /** Encrypts a new key; else `PH_IDENTITY_PASSWORD`, else a plain file. */
  password?: string;
  /** Tests: cheaper scrypt parameters. */
  kdf?: KdfParams;
}

/** The home folder's default pseudonym, made when there is none. */
async function ensureHomeDefault(
  opts: EnsurePseudonymOptions,
  env: Env,
): Promise<Address> {
  const held = homeDefault(env);
  if (held) return held;
  const password = opts.password ?? env[IDENTITY_PASSWORD_ENV];
  const made = await pseudonymFileOf(
    generatePrivateKey(),
    password || undefined,
    new Date().toISOString(),
    opts.kdf,
  );
  const homeFile = homePseudonymFile(made.address, env);
  keepKeyFile(homeFile, serializePseudonymFile(made), !password, true, env);
  const pointer = createOwnerOnlyFile(
    defaultFile(env),
    `${JSON.stringify({ version: 1, pseudonym: made.address }, null, 2)}\n`,
  );
  const home = homeDefault(env);
  if (!pointer.created && home !== made.address) {
    // Another process made the default first: this one is not needed.
    fs.rmSync(path.dirname(homeFile), { recursive: true, force: true });
  }
  if (!home) throw new Error(`No pseudonym in ${identityHome(env)}.`);
  return home;
}

/**
 * The pseudonym that acts in `dataDir`, made when there is none: called by
 * whatever must sign while nobody is logged in.
 *
 * 1. `PH_IDENTITY_KEY`: that key; nothing is written.
 * 2. The store has one: that one, also kept in the home folder.
 * 3. The home folder has a default: copied into the store byte for byte.
 * 4. Otherwise a new key, in the home folder (the default) and the store.
 *
 * With no `dataDir` the home folder's default, made when there is none, and
 * nothing is written outside the home folder.
 */
export async function ensurePseudonym(
  opts: EnsurePseudonymOptions,
): Promise<IdentityInfo> {
  const env = opts.env ?? process.env;
  if (env[IDENTITY_KEY_ENV]) {
    return readPseudonym({
      ...(opts.dataDir === undefined ? {} : { dataDir: opts.dataDir }),
      env,
    })!;
  }
  if (opts.dataDir === undefined) {
    await ensureHomeDefault(opts, env);
    return readPseudonym({ env })!;
  }
  const dataDir = path.resolve(opts.dataDir);
  const dataFile = dataPseudonymFile(dataDir);

  const adopt = (text: string): IdentityInfo => {
    const pseudonym = parsePseudonymFile(text, dataFile);
    const homeFile = homePseudonymFile(pseudonym.address, env);
    keepKeyFile(homeFile, text, pseudonym.key.type === "plain", true, env);
    if (!homeDefault(env)) {
      createOwnerOnlyFile(
        defaultFile(env),
        `${JSON.stringify({ version: 1, pseudonym: pseudonym.address }, null, 2)}\n`,
      );
    }
    recordCopy(pseudonym.address, dataDir, env);
    ignoreDataFolder(dataDir);
    return readPseudonym({ dataDir, env })!;
  };

  const own = readText(dataFile);
  if (own !== undefined) return adopt(own);

  const home = await ensureHomeDefault(opts, env);
  const text = readText(homePseudonymFile(home, env))!;
  const pseudonym = parsePseudonymFile(text);
  keepKeyFile(dataFile, text, pseudonym.key.type === "plain", true, env);
  // Created here or by a racing process: the store's file decides.
  return adopt(readText(dataFile)!);
}

// --------------------------------------------------------------- passwords

export class PasswordRequiredError extends Error {
  constructor(label: string) {
    super(
      `The key of ${label} is locked with a password. Set ${IDENTITY_PASSWORD_ENV}, or run the command in a terminal.`,
    );
    this.name = "PasswordRequiredError";
  }
}

/**
 * Reads a line from the terminal without showing it. Ctrl-C exits with 130,
 * as at any prompt.
 */
export function askPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stderr } = process;
    // A piped stdin has no raw mode.
    const tty = stdin as {
      setRawMode?: (on: boolean) => void;
      isRaw?: boolean;
    };
    let raw = false;
    try {
      tty.setRawMode?.(true);
      raw = tty.isRaw === true;
    } catch {
      // Not a terminal that can hide input.
    }
    stderr.write(raw ? prompt : `${prompt}(input will be visible) `);
    stdin.resume();
    stdin.setEncoding("utf8");
    let typed = "";
    const finish = (value: string) => {
      stdin.removeListener("data", onData);
      if (raw) tty.setRawMode?.(false);
      stdin.pause();
      stderr.write("\n");
      resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === 13 || code === 10 || code === 4) return finish(typed);
        if (code === 3) {
          if (raw) tty.setRawMode?.(false);
          stderr.write("\n");
          process.exit(130);
        }
        if (code === 127 || code === 8) {
          typed = typed.slice(0, -1);
          continue;
        }
        typed += ch;
      }
    };
    stdin.on("data", onData);
  });
}

export interface UnlockOptions {
  /** May a terminal be asked. */
  interactive: boolean;
  env?: Env;
  password?: string;
  /** Tests: the prompt. */
  ask?: (prompt: string) => Promise<string>;
}

/** The private key of a pseudonym, asking its password when it has one. */
export async function unlockPseudonym(
  info: IdentityInfo,
  opts: UnlockOptions,
): Promise<Uint8Array> {
  const env = opts.env ?? process.env;
  if (info.kind !== "pseudonym") {
    throw new Error(`${info.label} is a Renown login; it holds no key here.`);
  }
  if (info.source === "env") return parsePrivateKey(env[IDENTITY_KEY_ENV]!);
  const pseudonym = readPseudonymFile(info.file!);
  if (!pseudonym) throw new Error(`${info.file} is gone.`);
  if (pseudonym.key.type === "plain") {
    return parsePrivateKey(pseudonym.key.privateKey);
  }
  const keystore = pseudonym.key.keystore;
  const given = opts.password ?? env[IDENTITY_PASSWORD_ENV];
  if (given !== undefined) return decryptKeyV3(keystore, given);
  const ask =
    opts.ask ??
    (opts.interactive && process.stdin.isTTY ? askPassword : undefined);
  if (!ask) throw new PasswordRequiredError(info.label);
  for (let tries = 1; ; tries++) {
    try {
      return await decryptKeyV3(
        keystore,
        await ask(`Password for ${info.label}: `),
      );
    } catch (error) {
      if (!(error instanceof WrongPasswordError) || tries === 3) throw error;
      process.stderr.write(`${error.message}\n`);
    }
  }
}

/**
 * Sets, changes or removes (no `newPassword`) the password of the pseudonym
 * that acts in `dataDir`, in the home folder and in every data folder it was
 * copied into, so no unlocked copy is left. Makes one when there is none.
 */
export async function changePseudonymPassword(opts: {
  dataDir: string;
  env?: Env;
  /** The current one; asked through `unlock` when needed. */
  unlock?: Omit<UnlockOptions, "env">;
  newPassword?: string;
  kdf?: KdfParams;
}): Promise<{
  address: Address;
  created: boolean;
  written: string[];
  missing: string[];
}> {
  const env = opts.env ?? process.env;
  const dataDir = path.resolve(opts.dataDir);
  let info = readPseudonym({ dataDir, env });
  if (info?.source === "env") {
    throw new Error(`${IDENTITY_KEY_ENV} is set: that key has no file.`);
  }
  if (!info) {
    info = await ensurePseudonym({
      dataDir,
      env: { ...env, [IDENTITY_PASSWORD_ENV]: undefined },
      password: opts.newPassword ?? "",
      kdf: opts.kdf,
    });
    return {
      address: info.address,
      created: true,
      written: [homePseudonymFile(info.address, env), info.file!],
      missing: [],
    };
  }
  const key = await unlockPseudonym(info, {
    interactive: false,
    ...opts.unlock,
    env,
  });
  const current = readPseudonymFile(info.file!)!;
  const text = serializePseudonymFile(
    await pseudonymFileOf(
      key,
      opts.newPassword || undefined,
      current.createdAt,
      opts.kdf,
    ),
  );
  const targets = [
    homePseudonymFile(info.address, env),
    ...[dataDir, ...pseudonymCopies(info.address, env)].map(dataPseudonymFile),
  ].filter((file, index, all) => all.indexOf(file) === index);
  const written: string[] = [];
  const lost: string[] = [];
  for (const file of targets) {
    let there: PseudonymFile | undefined;
    try {
      there = readPseudonymFile(file);
    } catch {
      there = undefined;
    }
    if (there?.address !== info.address) {
      lost.push(file);
      continue;
    }
    keepKeyFile(file, text, !opts.newPassword, false, env);
    written.push(file);
  }
  return { address: info.address, created: false, written, missing: lost };
}
