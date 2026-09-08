import type { Action, Operation } from "@powerhousedao/shared/document-model";
import { deriveOperationId } from "@powerhousedao/shared/document-model";
import { parseSignatureHashField } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { SignatureVerifier } from "../../../src/executor/signature-verifier.js";
import { InvalidSignatureError } from "../../../src/shared/errors.js";
import type { SignatureVerificationHandler } from "../../../src/signer/types.js";
import { createTestAction, createTestOperation } from "../../factories.js";

function makeSignerContext(
  publicKey: string,
  signatures: [string, string, string, string, string][] = [
    ["ts", publicKey, "aid", "", "0xabcdef"],
  ],
) {
  return {
    signer: {
      user: { address: "0x123", chainId: 1, networkId: "1" },
      app: { name: "test", key: publicKey },
      signatures,
    },
  };
}

function makeActionWithSigner(
  publicKey: string,
  signatures?: [string, string, string, string, string][],
  overrides: Partial<Action> = {},
): Action {
  return createTestAction({
    ...overrides,
    context: makeSignerContext(publicKey, signatures),
  });
}

function makeOperationWithSigner(
  documentId: string,
  publicKey: string,
  signatures?: [string, string, string, string, string][],
  overrides: Partial<Operation> = {},
): Operation {
  const action = makeActionWithSigner(publicKey, signatures, {
    scope: "document",
  });
  return createTestOperation(documentId, {
    ...overrides,
    action,
    id:
      overrides.id ||
      deriveOperationId(documentId, "document", "main", action.id),
  });
}

describe("SignatureVerifier", () => {
  describe("verifyActions", () => {
    it("should return immediately when no verifier is configured", async () => {
      const verifier = new SignatureVerifier(undefined);
      const action = makeActionWithSigner("0xpubkey");

      await expect(
        verifier.verifyActions("doc-1", "main", [action]),
      ).resolves.toBeUndefined();
    });

    it("should skip actions without signer context", async () => {
      const handler = vi.fn();
      const verifier = new SignatureVerifier(handler);
      const action = createTestAction({ scope: "document" });

      await verifier.verifyActions("doc-1", "main", [action]);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should throw InvalidSignatureError for signer with empty signatures", async () => {
      const handler = vi.fn();
      const verifier = new SignatureVerifier(handler);
      const action = makeActionWithSigner("0xpubkey", []);

      await expect(
        verifier.verifyActions("doc-1", "main", [action]),
      ).rejects.toThrow(InvalidSignatureError);

      await expect(
        verifier.verifyActions("doc-1", "main", [action]),
      ).rejects.toThrow(/no signatures/);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should call verifier with constructed operation and public key", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(true);
      const verifier = new SignatureVerifier(handler);
      const action = makeActionWithSigner("0xmykey");

      await verifier.verifyActions("doc-1", "main", [action]);

      expect(handler).toHaveBeenCalledTimes(1);
      const [calledOp, calledKey] = (handler as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(calledKey).toBe("0xmykey");
      expect(calledOp.action).toBe(action);
      expect(calledOp.id).toBe(
        deriveOperationId("doc-1", action.scope, "main", action.id),
      );
    });

    it("should throw InvalidSignatureError when verifier returns false", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(false);
      const verifier = new SignatureVerifier(handler);
      const action = makeActionWithSigner("0xpubkey");

      await expect(
        verifier.verifyActions("doc-1", "main", [action]),
      ).rejects.toThrow(InvalidSignatureError);

      await expect(
        verifier.verifyActions("doc-1", "main", [action]),
      ).rejects.toThrow(/verification returned false/);
    });

    it("should wrap verifier errors in InvalidSignatureError", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockRejectedValue(new Error("crypto failure"));
      const verifier = new SignatureVerifier(handler);
      const action = makeActionWithSigner("0xpubkey");

      await expect(
        verifier.verifyActions("doc-1", "main", [action]),
      ).rejects.toThrow(InvalidSignatureError);

      await expect(
        verifier.verifyActions("doc-1", "main", [action]),
      ).rejects.toThrow(/verification failed: crypto failure/);
    });

    it("should wrap non-Error thrown values in InvalidSignatureError", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockRejectedValue("string error");
      const verifier = new SignatureVerifier(handler);
      const action = makeActionWithSigner("0xpubkey");

      await expect(
        verifier.verifyActions("doc-1", "main", [action]),
      ).rejects.toThrow(InvalidSignatureError);

      await expect(
        verifier.verifyActions("doc-1", "main", [action]),
      ).rejects.toThrow(/verification failed: string error/);
    });

    it("should verify multiple actions in sequence and fail fast", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const verifier = new SignatureVerifier(handler);
      const action1 = makeActionWithSigner("0xpubkey");
      const action2 = makeActionWithSigner("0xpubkey");
      const action3 = makeActionWithSigner("0xpubkey");

      await expect(
        verifier.verifyActions("doc-1", "main", [action1, action2, action3]),
      ).rejects.toThrow(InvalidSignatureError);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should skip unsigned actions and verify signed ones", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(true);
      const verifier = new SignatureVerifier(handler);
      const unsigned = createTestAction({ scope: "document" });
      const signed = makeActionWithSigner("0xpubkey");

      await verifier.verifyActions("doc-1", "main", [unsigned, signed]);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should include action ID in error messages", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(false);
      const verifier = new SignatureVerifier(handler);
      const action = makeActionWithSigner("0xpubkey");

      try {
        await verifier.verifyActions("doc-1", "main", [action]);
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidSignatureError);
        expect((error as InvalidSignatureError).message).toContain(action.id);
        expect((error as InvalidSignatureError).documentId).toBe("doc-1");
      }
    });

    it("should succeed for valid signatures", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(true);
      const verifier = new SignatureVerifier(handler);
      const action1 = makeActionWithSigner("0xpubkey");
      const action2 = makeActionWithSigner("0xpubkey");

      await expect(
        verifier.verifyActions("doc-1", "main", [action1, action2]),
      ).resolves.toBeUndefined();

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("verifyOperations", () => {
    it("should return immediately when no verifier is configured", async () => {
      const verifier = new SignatureVerifier(undefined);
      const operation = makeOperationWithSigner("doc-1", "0xpubkey");

      await expect(
        verifier.verifyOperations("doc-1", [operation]),
      ).resolves.toBeUndefined();
    });

    it("should skip operations without signer context", async () => {
      const handler = vi.fn();
      const verifier = new SignatureVerifier(handler);
      const operation = createTestOperation("doc-1");

      await verifier.verifyOperations("doc-1", [operation]);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should throw InvalidSignatureError for signer with empty signatures", async () => {
      const handler = vi.fn();
      const verifier = new SignatureVerifier(handler);
      const operation = makeOperationWithSigner("doc-1", "0xpubkey", []);

      await expect(
        verifier.verifyOperations("doc-1", [operation]),
      ).rejects.toThrow(InvalidSignatureError);

      await expect(
        verifier.verifyOperations("doc-1", [operation]),
      ).rejects.toThrow(/no signatures/);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should include operation ID and index in error messages", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(false);
      const verifier = new SignatureVerifier(handler);
      const operation = makeOperationWithSigner(
        "doc-1",
        "0xpubkey",
        undefined,
        {
          index: 5,
        },
      );

      try {
        await verifier.verifyOperations("doc-1", [operation]);
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidSignatureError);
        const msg = (error as InvalidSignatureError).message;
        expect(msg).toContain(operation.id);
        expect(msg).toContain("index 5");
        expect((error as InvalidSignatureError).documentId).toBe("doc-1");
      }
    });

    it("should call verifier with actual operation and public key", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(true);
      const verifier = new SignatureVerifier(handler);
      const operation = makeOperationWithSigner("doc-1", "0xmykey");

      await verifier.verifyOperations("doc-1", [operation]);

      expect(handler).toHaveBeenCalledTimes(1);
      const [calledOp, calledKey] = (handler as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(calledOp).toBe(operation);
      expect(calledKey).toBe("0xmykey");
    });

    it("should throw InvalidSignatureError when verifier returns false", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(false);
      const verifier = new SignatureVerifier(handler);
      const operation = makeOperationWithSigner("doc-1", "0xpubkey");

      await expect(
        verifier.verifyOperations("doc-1", [operation]),
      ).rejects.toThrow(InvalidSignatureError);

      await expect(
        verifier.verifyOperations("doc-1", [operation]),
      ).rejects.toThrow(/verification returned false/);
    });

    it("should wrap verifier errors in InvalidSignatureError", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockRejectedValue(new Error("verification engine error"));
      const verifier = new SignatureVerifier(handler);
      const operation = makeOperationWithSigner("doc-1", "0xpubkey");

      await expect(
        verifier.verifyOperations("doc-1", [operation]),
      ).rejects.toThrow(InvalidSignatureError);

      await expect(
        verifier.verifyOperations("doc-1", [operation]),
      ).rejects.toThrow(/verification failed: verification engine error/);
    });

    it("should wrap non-Error thrown values in InvalidSignatureError", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockRejectedValue(42);
      const verifier = new SignatureVerifier(handler);
      const operation = makeOperationWithSigner("doc-1", "0xpubkey");

      await expect(
        verifier.verifyOperations("doc-1", [operation]),
      ).rejects.toThrow(/verification failed: 42/);
    });

    it("should verify multiple operations in sequence and fail fast", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const verifier = new SignatureVerifier(handler);
      const op1 = makeOperationWithSigner("doc-1", "0xpubkey", undefined, {
        index: 0,
      });
      const op2 = makeOperationWithSigner("doc-1", "0xpubkey", undefined, {
        index: 1,
      });
      const op3 = makeOperationWithSigner("doc-1", "0xpubkey", undefined, {
        index: 2,
      });

      await expect(
        verifier.verifyOperations("doc-1", [op1, op2, op3]),
      ).rejects.toThrow(InvalidSignatureError);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should skip unsigned operations and verify signed ones", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(true);
      const verifier = new SignatureVerifier(handler);
      const unsigned = createTestOperation("doc-1", { index: 0 });
      const signed = makeOperationWithSigner("doc-1", "0xpubkey", undefined, {
        index: 1,
      });

      await verifier.verifyOperations("doc-1", [unsigned, signed]);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should succeed for valid signatures across all operations", async () => {
      const handler: SignatureVerificationHandler = vi
        .fn()
        .mockResolvedValue(true);
      const verifier = new SignatureVerifier(handler);
      const op1 = makeOperationWithSigner("doc-1", "0xpubkey", undefined, {
        index: 0,
      });
      const op2 = makeOperationWithSigner("doc-1", "0xpubkey", undefined, {
        index: 1,
      });

      await expect(
        verifier.verifyOperations("doc-1", [op1, op2]),
      ).resolves.toBeUndefined();

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("previous state chaining", () => {
    /**
     * Mirrors the production rule: a signature that declares a previous state
     * must match the state the verifier's caller says it applies to (#2894).
     */
    const chainingHandler: SignatureVerificationHandler = (
      operation,
      _publicKey,
      context,
    ) => {
      const signatures = operation.action.context!.signer!.signatures;
      const declared = parseSignatureHashField(
        signatures[signatures.length - 1][3],
      ).prevStateHash;
      return Promise.resolve(
        declared === "" ||
          context.previousStateHash === undefined ||
          declared === context.previousStateHash,
      );
    };

    it("passes the stored head to the first action", async () => {
      const handler = vi.fn(chainingHandler);
      const verifier = new SignatureVerifier(handler);
      const action = makeActionWithSigner("0xpubkey", [
        ["ts", "0xpubkey", "aid", "head-hash", "0xabcdef"],
      ]);

      await expect(
        verifier.verifyActions("doc-1", "main", [action], "head-hash"),
      ).resolves.toBeUndefined();

      expect(handler.mock.calls[0][2].previousStateHash).toBe("head-hash");
    });

    it("rejects the first action when it declares a different state", async () => {
      const verifier = new SignatureVerifier(vi.fn(chainingHandler));
      const action = makeActionWithSigner("0xpubkey", [
        ["ts", "0xpubkey", "aid", "other-hash", "0xabcdef"],
      ]);

      await expect(
        verifier.verifyActions("doc-1", "main", [action], "head-hash"),
      ).rejects.toThrow(InvalidSignatureError);
    });

    it("chains the second action onto the first action's resulting state", async () => {
      const handler = vi.fn(chainingHandler);
      const verifier = new SignatureVerifier(handler);
      const first = makeActionWithSigner("0xpubkey", [
        ["ts", "0xpubkey", "aid-1", "head-hash:state-1", "0xabcdef"],
      ]);
      const second = makeActionWithSigner("0xpubkey", [
        ["ts", "0xpubkey", "aid-2", "state-1", "0xabcdef"],
      ]);

      await expect(
        verifier.verifyActions("doc-1", "main", [first, second], "head-hash"),
      ).resolves.toBeUndefined();

      expect(handler.mock.calls[0][2].previousStateHash).toBe("head-hash");
      expect(handler.mock.calls[1][2].previousStateHash).toBe("state-1");
    });

    it("rejects the second action when it declares another state", async () => {
      const verifier = new SignatureVerifier(vi.fn(chainingHandler));
      const first = makeActionWithSigner("0xpubkey", [
        ["ts", "0xpubkey", "aid-1", "head-hash:state-1", "0xabcdef"],
      ]);
      const second = makeActionWithSigner("0xpubkey", [
        ["ts", "0xpubkey", "aid-2", "state-elsewhere", "0xabcdef"],
      ]);

      await expect(
        verifier.verifyActions("doc-1", "main", [first, second], "head-hash"),
      ).rejects.toThrow(InvalidSignatureError);
    });

    it("omits previousStateHash when the preceding signature carries no resulting hash", async () => {
      const handler = vi.fn(chainingHandler);
      const verifier = new SignatureVerifier(handler);
      const first = makeActionWithSigner("0xpubkey", [
        ["ts", "0xpubkey", "aid-1", "head-hash", "0xabcdef"],
      ]);
      const second = makeActionWithSigner("0xpubkey", [
        ["ts", "0xpubkey", "aid-2", "state-anything", "0xabcdef"],
      ]);

      await expect(
        verifier.verifyActions("doc-1", "main", [first, second], "head-hash"),
      ).resolves.toBeUndefined();

      expect(handler.mock.calls[1][2].previousStateHash).toBeUndefined();
    });

    it("chains operations onto the preceding operation's resulting state", async () => {
      const handler = vi.fn(chainingHandler);
      const verifier = new SignatureVerifier(handler);
      const op1 = makeOperationWithSigner(
        "doc-1",
        "0xpubkey",
        [["ts", "0xpubkey", "aid-1", "head-hash:state-1", "0xabcdef"]],
        { index: 0 },
      );
      const op2 = makeOperationWithSigner(
        "doc-1",
        "0xpubkey",
        [["ts", "0xpubkey", "aid-2", "state-1", "0xabcdef"]],
        { index: 1 },
      );

      await expect(
        verifier.verifyOperations("doc-1", [op1, op2], "head-hash"),
      ).resolves.toBeUndefined();

      expect(handler.mock.calls[1][2].previousStateHash).toBe("state-1");
    });
  });
});
