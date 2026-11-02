import { verifyDelegationProof } from "@renown/sdk/node";
import { encryptKeystoreJson, Wallet } from "ethers";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createKeyFile,
  decryptKey,
  encryptKey,
  readKeystore,
  signDelegation,
  WrongPasswordError,
  type KdfParams,
  type Keystore,
} from "../src/local-key.js";

/** Cheap, so the suite stays quick; the format is the same. */
const QUICK: KdfParams = { n: 1024, r: 8, p: 1, dklen: 32 };

const PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADDRESS = privateKeyToAccount(PRIVATE_KEY).address;

describe("the keystore", () => {
  it("is a keystore another wallet can open", async () => {
    const keystore = await encryptKey(PRIVATE_KEY, "correct horse", QUICK);

    const wallet = await Wallet.fromEncryptedJson(
      JSON.stringify(keystore),
      "correct horse",
    );

    expect(wallet.address).toBe(ADDRESS);
    expect(wallet.privateKey).toBe(PRIVATE_KEY);
  });

  it("opens a keystore another wallet wrote", async () => {
    const json = await encryptKeystoreJson(
      { address: ADDRESS, privateKey: PRIVATE_KEY },
      "correct horse",
      { scrypt: { N: 1024 } },
    );

    await expect(
      decryptKey(JSON.parse(json) as Keystore, "correct horse"),
    ).resolves.toBe(PRIVATE_KEY);
  });

  it("round-trips a key", async () => {
    const keystore = await encryptKey(PRIVATE_KEY, "correct horse", QUICK);

    await expect(decryptKey(keystore, "correct horse")).resolves.toBe(
      PRIVATE_KEY,
    );
  });

  it("names the address without the password", async () => {
    const keystore = await encryptKey(PRIVATE_KEY, "correct horse", QUICK);

    expect(keystore.address).toBe(ADDRESS.slice(2).toLowerCase());
    expect(keystore.version).toBe(3);
  });

  it("holds no trace of the key", async () => {
    const keystore = await encryptKey(PRIVATE_KEY, "correct horse", QUICK);

    expect(JSON.stringify(keystore)).not.toContain(PRIVATE_KEY.slice(2));
  });

  it("refuses the wrong password", async () => {
    const keystore = await encryptKey(PRIVATE_KEY, "correct horse", QUICK);

    await expect(decryptKey(keystore, "battery staple")).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
  });

  it("refuses a kdf it can't read, naming it", async () => {
    const keystore = await encryptKey(PRIVATE_KEY, "correct horse", QUICK);
    const pbkdf2 = {
      ...keystore,
      crypto: { ...keystore.crypto, kdf: "pbkdf2" },
    } as unknown as Keystore;

    await expect(decryptKey(pbkdf2, "correct horse")).rejects.toThrow(/pbkdf2/);
  });
});

describe("the key file", () => {
  let dir: string;
  const app = "did:key:zSessionKey";

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-key-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const input = (keyPath: string, password = "correct horse") => ({
    keyPath,
    password,
    credentialsPath: path.join(dir, "local", ".ph", ".credentials.json"),
    chainId: 1,
    appName: "connect",
    appDid: app,
  });

  it("leaves nothing half-written", async () => {
    const keyPath = path.join(dir, "local.key");

    const address = await createKeyFile(keyPath, "correct horse", QUICK);

    expect(fs.readdirSync(dir)).toEqual(["local.key"]);
    expect(readKeystore(keyPath).address).toBe(address.slice(2).toLowerCase());
  });

  it("replaces a key, with a new address", async () => {
    const keyPath = path.join(dir, "local.key");
    const first = await createKeyFile(keyPath, "correct horse", QUICK);

    const second = await createKeyFile(keyPath, "another password", QUICK);

    expect(second).not.toBe(first);
    await expect(
      signDelegation(input(keyPath, "correct horse")),
    ).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("delegates to the session key, with a proof the switchboard accepts", async () => {
    const keyPath = path.join(dir, "local.key");
    const address = await createKeyFile(keyPath, "correct horse", QUICK);

    const { credential } = await signDelegation(input(keyPath));

    expect(credential.issuer.ethereumAddress).toBe(address);
    expect(credential.credentialSubject.id).toBe(app);
    await expect(verifyDelegationProof(credential, 1)).resolves.toBe(true);
  });

  it("keeps the credential where the switchboard looks, by its key", async () => {
    const keyPath = path.join(dir, "local.key");
    const address = await createKeyFile(keyPath, "correct horse", QUICK);
    const { credentialsPath } = input(keyPath);
    fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
    fs.writeFileSync(credentialsPath, JSON.stringify({ other: { id: "x" } }));

    const { credential } = await signDelegation(input(keyPath));

    const kept = JSON.parse(fs.readFileSync(credentialsPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(kept[`${address.toLowerCase()}|1|${app}`]).toEqual(credential);
    expect(kept.other).toEqual({ id: "x" });
  });
});
