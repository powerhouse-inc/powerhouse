import type { Action, Signature } from "@powerhousedao/shared/document-model";
import {
  deriveOperationId,
  hashActionV2,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it } from "vitest";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
  createSignatureVerifier,
  extractResultingHashFromSignature,
  parseSignatureHashField,
  signatureHasResultingHash,
  type IRenownCrypto,
} from "../../src/crypto/index.js";

const TEST_DOC_ID = "test-doc-id";
const TEST_BRANCH = "main";
const TEST_SCOPE = "global";
const TARGET = { documentId: TEST_DOC_ID, branch: TEST_BRANCH };

function createTestAction(options?: { prevOpHash?: string }): Action {
  return {
    id: "action-1",
    type: "TEST_ACTION",
    timestampUtcMs: new Date().toISOString(),
    input: { foo: "bar" },
    scope: "global",
    context: options?.prevOpHash
      ? { prevOpHash: options.prevOpHash }
      : undefined,
  };
}

function createOperationWithSignature(
  action: Action,
  signature: Signature,
  did: string,
): Operation {
  const signedAction: Action = {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address: did, chainId: 1, networkId: "eip155" },
        app: { name: "test-app", key: did },
        signatures: [signature],
      },
    },
  };

  return {
    id: deriveOperationId(
      TEST_DOC_ID,
      TEST_SCOPE,
      TEST_BRANCH,
      signedAction.id,
    ),
    index: 0,
    timestampUtcMs: action.timestampUtcMs,
    hash: "",
    skip: 0,
    action: signedAction,
  };
}

describe("RenownCryptoSigner", () => {
  let keyStorage: MemoryKeyStorage;
  let renownCrypto: IRenownCrypto;
  let signer: RenownCryptoSigner;
  let verifier: ReturnType<typeof createSignatureVerifier>;

  beforeEach(async () => {
    keyStorage = new MemoryKeyStorage();
    renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(keyStorage)
      .build();
    signer = new RenownCryptoSigner(renownCrypto, "test-app");
    verifier = createSignatureVerifier();
  });

  describe("signActionWithResultingState", () => {
    it("should include resultingStateHash in signature element [3]", async () => {
      const action = createTestAction();
      const resultingHash = "resulting-hash-abc123";

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        resultingHash,
      );

      expect(signature).toHaveLength(5);
      expect(signature[3]).toContain(":");
      expect(signature[3]).toContain(resultingHash);
    });

    it("should format hashField as prevStateHash:resultingStateHash", async () => {
      const action = createTestAction({ prevOpHash: "prev-hash-xyz" });
      const resultingHash = "resulting-hash-abc123";

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        resultingHash,
      );

      expect(signature[3]).toBe("prev-hash-xyz:resulting-hash-abc123");
    });

    it("should handle empty prevStateHash", async () => {
      const action = createTestAction(); // no prevOpHash
      const resultingHash = "resulting-hash-abc123";

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        resultingHash,
      );

      expect(signature[3]).toBe(":resulting-hash-abc123");
    });

    it("should produce verifiable signatures", async () => {
      const action = createTestAction();
      const resultingHash = "resulting-hash-abc123";

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        resultingHash,
      );

      // The signature should still be cryptographically valid
      // (verification rebuilds message from params[0-3])
      const operation = createOperationWithSignature(
        action,
        signature,
        signer.app.key,
      );
      const result = await verifier(operation, signer.app.key);

      expect(result).toBe(true);
    });

    it("should abort when signal is aborted before starting", async () => {
      const action = createTestAction();
      const controller = new AbortController();
      controller.abort();

      await expect(
        signer.signActionWithResultingState(
          action,
          TARGET,
          "hash",
          controller.signal,
        ),
      ).rejects.toThrow("Signing aborted");
    });

    it("should produce different signatures than signAction for same action", async () => {
      const action = createTestAction({ prevOpHash: "prev-hash" });
      const resultingHash = "resulting-hash";

      const sig1 = await signer.signAction(action, TARGET);
      const sig2 = await signer.signActionWithResultingState(
        action,
        TARGET,
        resultingHash,
      );

      // Element [3] should differ
      expect(sig1[3]).toBe("prev-hash");
      expect(sig2[3]).toBe("prev-hash:resulting-hash");

      // Signature hex [4] should differ (different message signed)
      expect(sig1[4]).not.toBe(sig2[4]);
    });

    it("should handle empty resultingStateHash", async () => {
      const action = createTestAction({ prevOpHash: "prev-hash" });

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        "",
      );

      expect(signature[3]).toBe("prev-hash:");
    });

    it("should handle both empty hashes", async () => {
      const action = createTestAction(); // no prevOpHash

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        "",
      );

      expect(signature[3]).toBe(":");
    });

    it("should include valid timestamp", async () => {
      const action = createTestAction();
      const beforeTimestamp = Math.floor(Date.now() / 1000);

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        "hash",
      );

      // Allow 2 second tolerance for timing variations
      const afterTimestamp = Math.floor(Date.now() / 1000) + 2;
      const signatureTimestamp = parseInt(signature[0], 10);

      expect(signatureTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(signatureTimestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it("should include signer DID in element [1]", async () => {
      const action = createTestAction();

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        "hash",
      );

      expect(signature[1]).toBe(renownCrypto.did);
      expect(signature[1].startsWith("did:key:z")).toBe(true);
    });

    it("should include action hash in element [2]", async () => {
      const action = createTestAction();

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        "hash",
      );

      expect(signature[2]).toBe(
        await hashActionV2(action, TARGET, {
          user: { address: "", networkId: "", chainId: 0 },
          app: signer.app,
        }),
      );
    });

    it("should include hex signature in element [4]", async () => {
      const action = createTestAction();

      const signature = await signer.signActionWithResultingState(
        action,
        TARGET,
        "hash",
      );

      expect(signature[4].startsWith("0x")).toBe(true);
      expect(signature[4].length).toBeGreaterThan(2);
    });
  });
});

describe("RenownCryptoSigner.signAction", () => {
  const user = { address: "0xabc", networkId: "eip155", chainId: 1 };

  async function userSigner(): Promise<RenownCryptoSigner> {
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    return new RenownCryptoSigner(renownCrypto, "test-app", user);
  }

  it("emits a v2 tuple over the target and the signer's identity", async () => {
    const signer = await userSigner();
    const action = createTestAction();

    const signature = await signer.signAction(action, TARGET);

    expect(signature[1]).toBe(signer.app.key);
    expect(signature[2]).toBe(
      await hashActionV2(action, TARGET, { user, app: signer.app }),
    );
    expect(signature[4]).toMatch(/^0x[0-9a-f]{128}$/);
  });

  it("refuses to sign for an empty document id", async () => {
    const signer = await userSigner();
    await expect(
      signer.signAction(createTestAction(), { documentId: "", branch: "main" }),
    ).rejects.toThrow(/documentId/);
  });

  it("still emits the legacy tuple on request", async () => {
    const signer = await userSigner();
    const signature = await signer.signActionLegacy(createTestAction());
    expect(signature[2]).toHaveLength(44);
  });
});

describe("createSignatureVerifier and v2 tuples", () => {
  it("accepts a tuple signAction produced", async () => {
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const signer = new RenownCryptoSigner(renownCrypto, "test-app");
    const action = createTestAction();
    const operation = createOperationWithSignature(
      action,
      await signer.signAction(action, TARGET),
      renownCrypto.did,
    );

    await expect(
      createSignatureVerifier(true)(operation, renownCrypto.did),
    ).resolves.toBe(true);
  });

  it("accepts a v2-prefixed hash on ECDSA alone, so old peers admit v2 writes", async () => {
    const renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(new MemoryKeyStorage())
      .build();
    const params: [string, string, string, string] = [
      "1790000000",
      renownCrypto.did,
      `v2:${"A".repeat(43)}`,
      "",
    ];
    const message = params.join("");
    const bytes = await renownCrypto.sign(
      new TextEncoder().encode(
        "\x19Signed Operation:\n" + message.length.toString() + message,
      ),
    );
    const hex = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const signature: Signature = [...params, `0x${hex}`];

    const operation = createOperationWithSignature(
      createTestAction(),
      signature,
      renownCrypto.did,
    );

    await expect(
      createSignatureVerifier(true)(operation, renownCrypto.did),
    ).resolves.toBe(true);
  });
});

describe("parseSignatureHashField", () => {
  it("should parse old format (no resulting hash)", () => {
    const result = parseSignatureHashField("prev-hash-abc");
    expect(result.prevStateHash).toBe("prev-hash-abc");
    expect(result.resultingStateHash).toBeUndefined();
  });

  it("should parse new format (with resulting hash)", () => {
    const result = parseSignatureHashField("prev-hash:resulting-hash");
    expect(result.prevStateHash).toBe("prev-hash");
    expect(result.resultingStateHash).toBe("resulting-hash");
  });

  it("should handle empty prevStateHash", () => {
    const result = parseSignatureHashField(":resulting-hash");
    expect(result.prevStateHash).toBe("");
    expect(result.resultingStateHash).toBe("resulting-hash");
  });

  it("should handle empty string", () => {
    const result = parseSignatureHashField("");
    expect(result.prevStateHash).toBe("");
    expect(result.resultingStateHash).toBeUndefined();
  });
});

describe("extractResultingHashFromSignature", () => {
  it("should return undefined for old format signatures", () => {
    const signature: Signature = ["ts", "did", "hash", "prevHash", "0xsig"];
    expect(extractResultingHashFromSignature(signature)).toBeUndefined();
  });

  it("should return resulting hash for new format signatures", () => {
    const signature: Signature = ["ts", "did", "hash", "prev:result", "0xsig"];
    expect(extractResultingHashFromSignature(signature)).toBe("result");
  });
});

describe("signatureHasResultingHash", () => {
  it("should return false for old format", () => {
    const signature: Signature = ["ts", "did", "hash", "prevHash", "0xsig"];
    expect(signatureHasResultingHash(signature)).toBe(false);
  });

  it("should return true for new format", () => {
    const signature: Signature = ["ts", "did", "hash", "prev:result", "0xsig"];
    expect(signatureHasResultingHash(signature)).toBe(true);
  });
});
