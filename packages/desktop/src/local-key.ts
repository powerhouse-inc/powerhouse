import { buildAndSignCredential } from "@renown/sdk/node";
import type { SignCredentialTypedData } from "@renown/sdk/node";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { concat, keccak256 } from "viem";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * A desktop's local identity: an Ethereum key in a V3 keystore (Web3 Secret
 * Storage), the format geth, Foundry and MetaMask read, so the key is never
 * locked into this app. The address stays readable without the password, which
 * is how the sign-in page can name the identity before anyone unlocks it.
 *
 * Unlocking signs one delegation to the window's session key, the same
 * credential a wallet signs through Renown, and keeps it where the switchboard
 * looks for it. The key is then gone from memory: this runs as a short-lived
 * process, and everything after it works from the delegation.
 */

export type KdfParams = { n: number; r: number; p: number; dklen: number };

/** The keystore standard's own defaults. */
const KDF: KdfParams = { n: 262144, r: 8, p: 1, dklen: 32 };

export type Keystore = {
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
    super("That password doesn't unlock this key.");
    this.name = "WrongPasswordError";
  }
}

const hexOf = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytesOf = (hex: string) => Buffer.from(hex.replace(/^0x/, ""), "hex");

function derive(
  password: string,
  salt: Buffer,
  { n, r, p, dklen }: KdfParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // What scrypt needs for these parameters, with room for its bookkeeping.
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

function macOf(derived: Buffer, ciphertext: Buffer): string {
  const message = concat([derived.subarray(16, 32), ciphertext]);
  return keccak256(message).slice(2);
}

export async function encryptKey(
  privateKey: Hex,
  password: string,
  kdf: KdfParams = KDF,
): Promise<Keystore> {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const derived = await derive(password, salt, kdf);
  const cipher = createCipheriv("aes-128-ctr", derived.subarray(0, 16), iv);
  const ciphertext = Buffer.concat([
    cipher.update(bytesOf(privateKey)),
    cipher.final(),
  ]);
  return {
    version: 3,
    id: randomUUID(),
    address: privateKeyToAccount(privateKey).address.slice(2).toLowerCase(),
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

export async function decryptKey(
  keystore: Keystore,
  password: string,
): Promise<Hex> {
  // Some wallets write the field as `Crypto`.
  const crypto =
    keystore.crypto ??
    (keystore as unknown as { Crypto: Keystore["crypto"] }).Crypto;
  if (crypto.kdf !== "scrypt" || crypto.cipher !== "aes-128-ctr") {
    throw new Error(`Can't read a ${crypto.kdf} / ${crypto.cipher} key.`);
  }
  const { salt, ...kdf } = crypto.kdfparams;
  const derived = await derive(password, bytesOf(salt), kdf);
  const ciphertext = bytesOf(crypto.ciphertext);
  const mac = Buffer.from(macOf(derived, ciphertext), "hex");
  const expected = bytesOf(crypto.mac);
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    throw new WrongPasswordError();
  }
  const decipher = createDecipheriv(
    "aes-128-ctr",
    derived.subarray(0, 16),
    bytesOf(crypto.cipherparams.iv),
  );
  const key = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return `0x${hexOf(key)}`;
}

/** Writes beside the target, then moves it in: a crash leaves the old file. */
function writePrivate(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.tmp`;
  fs.writeFileSync(partial, text, { mode: 0o600 });
  fs.renameSync(partial, file);
}

export function readKeystore(keyPath: string): Keystore {
  return JSON.parse(fs.readFileSync(keyPath, "utf8")) as Keystore;
}

/** A new key, replacing any there. Returns its address. */
export async function createKeyFile(
  keyPath: string,
  password: string,
  kdf: KdfParams = KDF,
): Promise<Hex> {
  const privateKey = generatePrivateKey();
  const keystore = await encryptKey(privateKey, password, kdf);
  writePrivate(keyPath, `${JSON.stringify(keystore, null, 2)}\n`);
  return privateKeyToAccount(privateKey).address;
}

export type SignDelegationInput = {
  keyPath: string;
  password: string;
  /** The identity's `.ph/.credentials.json`: the switchboard reads it. */
  credentialsPath: string;
  chainId: number;
  appName: string;
  /** The window's session key, which the delegation names. */
  appDid: string;
  expiresInDays?: number;
};

/** The file `FileCredentialKeep` reads, by the keys it uses. */
function keepCredential(
  credentialsPath: string,
  key: string,
  credential: unknown,
): void {
  let entries: Record<string, unknown> = {};
  try {
    entries = JSON.parse(fs.readFileSync(credentialsPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    // none kept yet
  }
  writePrivate(
    credentialsPath,
    JSON.stringify({ ...entries, [key]: credential }, null, 2),
  );
}

/**
 * Unlocks the key and delegates to the window's session key. A delegation lasts
 * a year, as nothing here needs it shorter: replacing the key is how it ends.
 */
export async function signDelegation(input: SignDelegationInput) {
  const { keyPath, password, credentialsPath, chainId, appName, appDid } =
    input;
  const keystore = readKeystore(keyPath);
  const privateKey = await decryptKey(keystore, password);
  const account = privateKeyToAccount(privateKey);
  const signTypedData: SignCredentialTypedData = (args) =>
    account.signTypedData(args as Parameters<typeof account.signTypedData>[0]);
  const credential = await buildAndSignCredential({
    signTypedData,
    address: account.address,
    chainId,
    app: appName,
    appId: appDid,
    expiresInDays: input.expiresInDays ?? 365,
  });
  keepCredential(
    credentialsPath,
    `${account.address.toLowerCase()}|${chainId}|${appDid}`,
    credential,
  );
  return { address: account.address, credential };
}
