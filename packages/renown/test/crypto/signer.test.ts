import type { Action, Signature } from "@powerhousedao/shared/document-model";
import {
  ab2hex,
  deriveOperationId,
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

function createTestAction(options?: {
  prevOpHash?: string;
  input?: unknown;
}): Action {
  return {
    id: "action-1",
    type: "TEST_ACTION",
    timestampUtcMs: new Date().toISOString(),
    input: options?.input ?? { foo: "bar" },
    scope: "global",
    context: options?.prevOpHash
      ? { prevOpHash: options.prevOpHash }
      : undefined,
  };
}

/**
 * Rebuilds a value with object keys in reverse order, recursively. Stands in
 * for a storage round-trip that re-serializes the action without preserving
 * key order (PGlite's JSONB reorders keys): key order is not part of the
 * action's content, so a binding must not depend on it.
 */
function reverseKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reverseKeyOrder);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const reversed: Record<string, unknown> = {};
    for (const key of Object.keys(record).reverse()) {
      reversed[key] = reverseKeyOrder(record[key]);
    }
    return reversed;
  }
  return value;
}

/** SHA-256 of a preimage string, base64-encoded (Web Crypto, test-only). */
async function hashPreimageBase64(preimage: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(preimage),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
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

  describe("createSignatureVerifier binding", () => {
    it("verifies a genuinely signed action", async () => {
      const action = createTestAction();
      const signature = await signer.signAction(action);
      const operation = createOperationWithSignature(
        action,
        signature,
        signer.app.key,
      );

      await expect(verifier(operation, signer.app.key)).resolves.toBe(true);
    });

    it("rejects a signature reattached to a different input", async () => {
      const action = createTestAction();
      const signature = await signer.signAction(action);
      const replayed: Action = { ...action, input: { foo: "tampered" } };
      const operation = createOperationWithSignature(
        replayed,
        signature,
        signer.app.key,
      );

      await expect(verifier(operation, signer.app.key)).resolves.toBe(false);
    });

    it("rejects a signature reattached to a different type and scope", async () => {
      const action = createTestAction();
      const signature = await signer.signAction(action);
      const replayed: Action = {
        ...action,
        type: "OTHER_ACTION",
        scope: "document",
      };
      const operation = createOperationWithSignature(
        replayed,
        signature,
        signer.app.key,
      );

      await expect(verifier(operation, signer.app.key)).resolves.toBe(false);
    });

    it("rejects a signature made by a different key than the claimed signer", async () => {
      const otherCrypto = await new RenownCryptoBuilder()
        .withKeyPairStorage(new MemoryKeyStorage())
        .build();
      const otherSigner = new RenownCryptoSigner(otherCrypto, "test-app");
      const action = createTestAction();
      const signature = await otherSigner.signAction(action);
      const operation = createOperationWithSignature(
        action,
        signature,
        signer.app.key,
      );

      await expect(verifier(operation, signer.app.key)).resolves.toBe(false);
    });

    it("binds when the executor invokes the verifier with the document context", async () => {
      const action = createTestAction();
      const signature = await signer.signAction(action);
      const operation = createOperationWithSignature(
        action,
        signature,
        signer.app.key,
      );
      const context = { documentId: TEST_DOC_ID, branch: TEST_BRANCH };

      // The executor passes the document scope as the verifier's third
      // argument (#2894).
      await expect(verifier(operation, signer.app.key, context)).resolves.toBe(
        true,
      );

      const replayed: Action = { ...action, input: { foo: "nope" } };
      const replayedOp = createOperationWithSignature(
        replayed,
        signature,
        signer.app.key,
      );
      await expect(verifier(replayedOp, signer.app.key, context)).resolves.toBe(
        false,
      );
    });

    it("verifies a signature whose action came back from a key-reordering store", async () => {
      const input = { z: 1, a: 2, m: { q: 1, b: 2 } };
      const action = createTestAction({ input });
      const signature = await signer.signAction(action);

      // The action round-tripped through storage and its keys came back in
      // a different order. The binding must follow the content, not the key
      // order (#2894).
      const stored: Action = {
        ...action,
        input: reverseKeyOrder(input),
      };

      await expect(
        verifier(
          createOperationWithSignature(stored, signature, signer.app.key),
          signer.app.key,
        ),
      ).resolves.toBe(true);
    });

    it("verifies a pre-canonicalization signature unchanged, and rejects it after a reordering round-trip", async () => {
      const action = createTestAction({ input: { z: 1, a: 2 } });

      // A signature made before the preimage was canonicalized hashed the
      // input's insertion-order JSON. Rebuild that message and sign it the
      // way the old signer did.
      const legacyHash = await hashPreimageBase64(
        [action.scope, action.type, JSON.stringify(action.input)].join(""),
      );
      const timestamp = "1700000000";
      const message = [timestamp, signer.app.key, legacyHash, ""].join("");
      const signed = await signer.sign(
        new TextEncoder().encode(
          "\x19Signed Operation:\n" + message.length + message,
        ),
      );
      const signature: Signature = [
        timestamp,
        signer.app.key,
        legacyHash,
        "",
        `0x${ab2hex(signed)}`,
      ];

      // Unchanged text: the insertion-order candidate matches.
      await expect(
        verifier(
          createOperationWithSignature(action, signature, signer.app.key),
          signer.app.key,
        ),
      ).resolves.toBe(true);

      // Reordered storage: the text the signature was made over is gone, so
      // a pre-canonicalization signature cannot be recovered after a
      // key-reordering round-trip. The verifier says no deterministically
      // rather than trusting the hash the signature claims (#2894).
      const stored: Action = {
        ...action,
        input: reverseKeyOrder(action.input),
      };
      await expect(
        verifier(
          createOperationWithSignature(stored, signature, signer.app.key),
          signer.app.key,
        ),
      ).resolves.toBe(false);

      // Different content: no candidate matches.
      const tampered: Action = { ...action, input: { z: 99, a: 2 } };
      await expect(
        verifier(
          createOperationWithSignature(tampered, signature, signer.app.key),
          signer.app.key,
        ),
      ).resolves.toBe(false);
    });

    it("binds a signature to the document it was signed for", async () => {
      const action = {
        ...createTestAction(),
        context: { documentId: TEST_DOC_ID },
      };
      const signature = await signer.signAction(action);
      const operation = createOperationWithSignature(
        action,
        signature,
        signer.app.key,
      );

      await expect(
        verifier(operation, signer.app.key, { documentId: TEST_DOC_ID }),
      ).resolves.toBe(true);
    });

    it("rejects a document-bound signature replayed onto a different document", async () => {
      const action = {
        ...createTestAction(),
        context: { documentId: TEST_DOC_ID },
      };
      const signature = await signer.signAction(action);
      const operation = createOperationWithSignature(
        action,
        signature,
        signer.app.key,
      );

      // The signature's hash embeds the document it was signed for, so it
      // must not verify in another document, even with the same action
      // content (#2894).
      await expect(
        verifier(operation, signer.app.key, { documentId: "other-doc" }),
      ).resolves.toBe(false);
    });

    it("rejects a document-bound signature when the verifier has no document", async () => {
      const action = {
        ...createTestAction(),
        context: { documentId: TEST_DOC_ID },
      };
      const signature = await signer.signAction(action);
      const operation = createOperationWithSignature(
        action,
        signature,
        signer.app.key,
      );

      await expect(verifier(operation, signer.app.key)).resolves.toBe(false);
    });

    it("still verifies a legacy, document-agnostic signature in a document context", async () => {
      // Migration: signatures made before the preimage included the document
      // id - or by a signer that does not know it - keep verifying (#2894).
      const action = createTestAction();
      const signature = await signer.signAction(action);
      const operation = createOperationWithSignature(
        action,
        signature,
        signer.app.key,
      );

      await expect(
        verifier(operation, signer.app.key, { documentId: TEST_DOC_ID }),
      ).resolves.toBe(true);
    });

    it("treats an operation without an action as unsigned instead of throwing", async () => {
      // A runtime payload can be missing its action even though the type
      // says otherwise; the handler must fail closed, not throw (#2894).
      const signature = await signer.signAction(createTestAction());
      const broken = {
        ...createOperationWithSignature(
          createTestAction(),
          signature,
          signer.app.key,
        ),
        action: undefined,
      } as unknown as Operation;

      await expect(verifier(broken, signer.app.key)).resolves.toBe(true);
      await expect(
        createSignatureVerifier(true)(broken, signer.app.key),
      ).resolves.toBe(false);
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
