import { hashActionV2 } from "@powerhousedao/shared/document-model";
import { rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createNodeRenownSigner,
  NodeKeyStorage,
  RenownCryptoBuilder,
} from "../../src/crypto/node.js";

const KEYPAIR_PATH = "./test/tmp/node-signer-keypair.json";
const USER = { address: "0xswitchboard", networkId: "eip155", chainId: 1 };

describe("createNodeRenownSigner", () => {
  beforeEach(() => {
    rmSync(KEYPAIR_PATH, { force: true });
    delete process.env[NodeKeyStorage.RENOWN_PRIVATE_KEY_ENV];
  });

  afterEach(() => {
    rmSync(KEYPAIR_PATH, { force: true });
  });

  it("rebuilds the signer of the stored key and signs v2 as it", async () => {
    const original = await new RenownCryptoBuilder()
      .withKeyPairStorage(new NodeKeyStorage(KEYPAIR_PATH))
      .build();

    const signer = await createNodeRenownSigner({
      appName: "switchboard",
      keypairPath: KEYPAIR_PATH,
      user: USER,
      did: original.did,
    });

    expect(signer.app).toEqual({ name: "switchboard", key: original.did });
    expect(signer.user).toEqual(USER);

    const action = {
      id: "noop-1",
      type: "NOOP",
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
      input: {},
    };
    const target = { documentId: "doc-1", branch: "main" };
    const tuple = await signer.signAction(action, target);
    expect(tuple[1]).toBe(original.did);
    expect(tuple[2]).toBe(
      await hashActionV2(action, target, { user: USER, app: signer.app }),
    );
  });

  it("refuses to generate a key", async () => {
    await expect(
      createNodeRenownSigner({
        appName: "switchboard",
        keypairPath: KEYPAIR_PATH,
      }),
    ).rejects.toThrow(/No Renown keypair/);
  });

  it("refuses a stored key with another did", async () => {
    await new RenownCryptoBuilder()
      .withKeyPairStorage(new NodeKeyStorage(KEYPAIR_PATH))
      .build();

    await expect(
      createNodeRenownSigner({
        appName: "switchboard",
        keypairPath: KEYPAIR_PATH,
        did: "did:key:zOther",
      }),
    ).rejects.toThrow(/expected did:key:zOther/);
  });
});
