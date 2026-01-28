import {
  NodeKeyStorage,
  RenownCrypto,
  type JwkKeyPair,
} from "@renown/sdk/node";
import { subtle } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { afterEach } from "node:test";
import { beforeEach, describe, expect, it } from "vitest";

async function generateKeyPair(): Promise<JwkKeyPair> {
  const keyPair = await subtle.generateKey(RenownCrypto.algorithm, true, [
    "sign",
    "verify",
  ]);
  return {
    publicKey: await subtle.exportKey("jwk", keyPair.publicKey),
    privateKey: await subtle.exportKey("jwk", keyPair.privateKey),
  };
}

describe("Node key storage", () => {
  const keyPairPath = "./test/tmp/keypair.json";

  beforeEach(() => {
    rmSync(keyPairPath, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(keyPairPath, { recursive: true, force: true });
  });

  it("should load key pair from the provided filepath", async () => {
    const keyPair = await generateKeyPair();

    const keyStorage = new NodeKeyStorage(keyPairPath);

    writeFileSync(keyPairPath, JSON.stringify({ keyPair })); // Save key pair

    const loadedKeyPair = await keyStorage.loadKeyPair();
    expect(loadedKeyPair).toStrictEqual(keyPair);
  });

  it("should save key pair to the provided filepath", async () => {
    const keyStorage = new NodeKeyStorage(keyPairPath);
    const existingKeyPair = await keyStorage.loadKeyPair();
    expect(existingKeyPair).toBeUndefined();

    const keyPair = await generateKeyPair();
    await keyStorage.saveKeyPair(keyPair);

    const loadedKeyPair = await keyStorage.loadKeyPair();
    expect(loadedKeyPair).toStrictEqual(keyPair);
  });

  it("should load key pair from provided environment variable", async () => {
    const keyPair = await generateKeyPair();

    const ENV_KEY_NAME = "PH_RENOWN_PRIVATE_KEY_TEST";
    process.env[ENV_KEY_NAME] = JSON.stringify({ keyPair });

    const keyStorage = new NodeKeyStorage(keyPairPath, {
      envKeyName: ENV_KEY_NAME,
    });

    process.env[ENV_KEY_NAME] = JSON.stringify(keyPair);

    const loadedKeyPair = await keyStorage.loadKeyPair();
    expect(loadedKeyPair).toStrictEqual(keyPair);
  });

  it("should load key pair from the default filepath", async () => {
    const keyPair = await generateKeyPair();

    const keyStorage = new NodeKeyStorage();

    writeFileSync(
      NodeKeyStorage.DEFAULT_KEYPAIR_PATH,
      JSON.stringify({ keyPair }),
    );

    const loadedKeyPair = await keyStorage.loadKeyPair();
    expect(loadedKeyPair).toStrictEqual(keyPair);
  });

  it("should load key pair from default env var if no file path is provided", async () => {
    const keyPair = await generateKeyPair();

    process.env[NodeKeyStorage.ENV_KEY_NAME] = JSON.stringify({ keyPair });

    const keyStorage = new NodeKeyStorage();

    const loadedKeyPair = await keyStorage.loadKeyPair();
    expect(loadedKeyPair).toStrictEqual(keyPair);
  });
});
