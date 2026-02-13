import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
  createSignatureVerifier,
  parseSignatureHashField,
  extractResultingHashFromSignature,
  signatureHasResultingHash,
  type IRenownCrypto,
} from "../../src/crypto/index.js";
import type { Action, Operation, Signature } from "document-model";
import { deriveOperationId } from "document-model/core";
import { beforeEach, describe, expect, it } from "vitest";

const TEST_DOC_ID = "test-doc-id";
const TEST_BRANCH = "main";
const TEST_SCOPE = "global";

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
        resultingHash,
      );

      expect(signature[3]).toBe("prev-hash-xyz:resulting-hash-abc123");
    });

    it("should handle empty prevStateHash", async () => {
      const action = createTestAction(); // no prevOpHash
      const resultingHash = "resulting-hash-abc123";

      const signature = await signer.signActionWithResultingState(
        action,
        resultingHash,
      );

      expect(signature[3]).toBe(":resulting-hash-abc123");
    });

    it("should produce verifiable signatures", async () => {
      const action = createTestAction();
      const resultingHash = "resulting-hash-abc123";

      const signature = await signer.signActionWithResultingState(
        action,
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
        signer.signActionWithResultingState(action, "hash", controller.signal),
      ).rejects.toThrow("Signing aborted");
    });

    it("should produce different signatures than signAction for same action", async () => {
      const action = createTestAction({ prevOpHash: "prev-hash" });
      const resultingHash = "resulting-hash";

      const sig1 = await signer.signAction(action);
      const sig2 = await signer.signActionWithResultingState(
        action,
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

      const signature = await signer.signActionWithResultingState(action, "");

      expect(signature[3]).toBe("prev-hash:");
    });

    it("should handle both empty hashes", async () => {
      const action = createTestAction(); // no prevOpHash

      const signature = await signer.signActionWithResultingState(action, "");

      expect(signature[3]).toBe(":");
    });

    it("should include valid timestamp", async () => {
      const action = createTestAction();
      const beforeTimestamp = Math.floor(Date.now() / 1000);

      const signature = await signer.signActionWithResultingState(
        action,
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
        "hash",
      );

      expect(signature[1]).toBe(renownCrypto.did);
      expect(signature[1].startsWith("did:key:z")).toBe(true);
    });

    it("should include action hash in element [2]", async () => {
      const action = createTestAction();

      const signature = await signer.signActionWithResultingState(
        action,
        "hash",
      );

      // Hash should be a non-empty base64 string
      expect(signature[2]).toBeDefined();
      expect(signature[2].length).toBeGreaterThan(0);
    });

    it("should include hex signature in element [4]", async () => {
      const action = createTestAction();

      const signature = await signer.signActionWithResultingState(
        action,
        "hash",
      );

      expect(signature[4].startsWith("0x")).toBe(true);
      expect(signature[4].length).toBeGreaterThan(2);
    });
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
