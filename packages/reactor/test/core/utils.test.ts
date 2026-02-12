import type { Action, Signature } from "document-model";
import { describe, expect, it } from "vitest";
import { signAction, signActions } from "../../src/core/utils.js";
import { createMockSigner, createTestAction } from "../factories.js";

describe("signAction", () => {
  describe("when action has no existing signatures", () => {
    it("should sign the action and add signer context", async () => {
      const action: Action = createTestAction({
        id: "action-1",
        type: "TEST_ACTION",
      });
      const signer = createMockSigner({
        user: { address: "0x123", networkId: "eip155:1", chainId: 1 },
        app: { name: "test-app", key: "test-key" },
      });

      const result = await signAction(action, signer);

      expect(signer.signAction).toHaveBeenCalledWith(action, undefined);
      expect(result.context?.signer).toBeDefined();
      expect(result.context?.signer?.signatures).toHaveLength(1);
      expect(result.context?.signer?.app.key).toBe("test-key");
    });

    it("should sign action with empty signer context (no signatures array)", async () => {
      const action: Action = {
        ...createTestAction({
          id: "action-1",
          type: "TEST_ACTION",
        }),
        context: {
          signer: {
            user: { address: "", networkId: "", chainId: 0 },
            app: { name: "", key: "" },
            signatures: [],
          },
        },
      };
      const signer = createMockSigner({
        app: { name: "new-app", key: "new-key" },
      });

      const result = await signAction(action, signer);

      expect(signer.signAction).toHaveBeenCalled();
      expect(result.context?.signer?.app.key).toBe("new-key");
      expect(result.context?.signer?.signatures).toHaveLength(1);
    });

    it("should sign action without signer context", async () => {
      const action: Action = createTestAction({
        id: "action-1",
        type: "TEST_ACTION",
      });
      const signer = createMockSigner({
        user: { address: "0xABC", networkId: "eip155:1", chainId: 1 },
        app: { name: "my-app", key: "my-key" },
      });

      const result = await signAction(action, signer);

      expect(signer.signAction).toHaveBeenCalledWith(action, undefined);
      expect(result.context?.signer?.user.address).toBe("0xABC");
      expect(result.context?.signer?.app.name).toBe("my-app");
      expect(result.context?.signer?.signatures).toHaveLength(1);
    });

    it("should pass abort signal to signer", async () => {
      const action: Action = createTestAction();
      const signer = createMockSigner();
      const abortController = new AbortController();

      await signAction(action, signer, abortController.signal);

      expect(signer.signAction).toHaveBeenCalledWith(
        action,
        abortController.signal,
      );
    });
  });

  describe("when action already has signatures", () => {
    it("should NOT overwrite existing signatures", async () => {
      const existingSignature: Signature = [
        "timestamp",
        "original-signer-did",
        "action-hash",
        "prev-state-hash",
        "0xoriginal-signature",
      ];
      const action: Action = {
        ...createTestAction({
          id: "action-1",
          type: "TEST_ACTION",
        }),
        context: {
          signer: {
            user: { address: "0xOriginal", networkId: "eip155:1", chainId: 1 },
            app: { name: "original-app", key: "original-key" },
            signatures: [existingSignature],
          },
        },
      };
      const differentSigner = createMockSigner({
        app: { name: "different-app", key: "different-key" },
      });

      const result = await signAction(action, differentSigner);

      expect(differentSigner.signAction).not.toHaveBeenCalled();
      expect(result.context?.signer?.app.key).toBe("original-key");
      expect(result.context?.signer?.signatures).toHaveLength(1);
      expect(result.context?.signer?.signatures[0]).toEqual(existingSignature);
    });

    it("should preserve action with multiple existing signatures", async () => {
      const signature1: Signature = ["ts1", "did1", "hash1", "prev1", "0xsig1"];
      const signature2: Signature = ["ts2", "did2", "hash2", "prev2", "0xsig2"];
      const action: Action = {
        ...createTestAction({
          id: "action-1",
          type: "TEST_ACTION",
        }),
        context: {
          signer: {
            user: { address: "0x123", networkId: "eip155:1", chainId: 1 },
            app: { name: "app", key: "key" },
            signatures: [signature1, signature2],
          },
        },
      };
      const signer = createMockSigner();

      const result = await signAction(action, signer);

      expect(signer.signAction).not.toHaveBeenCalled();
      expect(result.context?.signer?.signatures).toHaveLength(2);
    });

    it("should return the exact same action object when already signed", async () => {
      const existingSignature: Signature = [
        "ts",
        "did",
        "hash",
        "prev",
        "0xsig",
      ];
      const action: Action = {
        ...createTestAction(),
        context: {
          signer: {
            user: { address: "0x123", networkId: "eip155:1", chainId: 1 },
            app: { name: "app", key: "key" },
            signatures: [existingSignature],
          },
        },
      };
      const signer = createMockSigner();

      const result = await signAction(action, signer);

      expect(result).toBe(action);
    });
  });
});

describe("signActions", () => {
  it("should preserve pre-signed actions while signing unsigned ones", async () => {
    const existingSignature: Signature = ["ts", "did", "hash", "prev", "0xsig"];
    const preSignedAction: Action = {
      ...createTestAction({
        id: "pre-signed",
        type: "TEST_ACTION",
      }),
      context: {
        signer: {
          user: { address: "0x123", networkId: "eip155:1", chainId: 1 },
          app: { name: "original-app", key: "original-key" },
          signatures: [existingSignature],
        },
      },
    };
    const unsignedAction: Action = createTestAction({
      id: "unsigned",
      type: "TEST_ACTION",
    });
    const signer = createMockSigner({
      app: { name: "new-app", key: "new-key" },
    });

    const results = await signActions(
      [preSignedAction, unsignedAction],
      signer,
    );

    expect(results[0].context?.signer?.app.key).toBe("original-key");
    expect(results[0].context?.signer?.signatures).toEqual([existingSignature]);
    expect(results[1].context?.signer?.app.key).toBe("new-key");
    expect(signer.signAction).toHaveBeenCalledTimes(1);
    expect(signer.signAction).toHaveBeenCalledWith(unsignedAction, undefined);
  });

  it("should sign all actions when none are pre-signed", async () => {
    const action1: Action = createTestAction({ id: "action-1" });
    const action2: Action = createTestAction({ id: "action-2" });
    const signer = createMockSigner();

    const results = await signActions([action1, action2], signer);

    expect(signer.signAction).toHaveBeenCalledTimes(2);
    expect(results[0].context?.signer?.signatures).toHaveLength(1);
    expect(results[1].context?.signer?.signatures).toHaveLength(1);
  });

  it("should not sign any actions when all are pre-signed", async () => {
    const signature1: Signature = ["ts1", "did1", "h1", "p1", "0xs1"];
    const signature2: Signature = ["ts2", "did2", "h2", "p2", "0xs2"];
    const action1: Action = {
      ...createTestAction({ id: "action-1" }),
      context: {
        signer: {
          user: { address: "0x1", networkId: "eip155:1", chainId: 1 },
          app: { name: "app1", key: "key1" },
          signatures: [signature1],
        },
      },
    };
    const action2: Action = {
      ...createTestAction({ id: "action-2" }),
      context: {
        signer: {
          user: { address: "0x2", networkId: "eip155:1", chainId: 1 },
          app: { name: "app2", key: "key2" },
          signatures: [signature2],
        },
      },
    };
    const signer = createMockSigner();

    const results = await signActions([action1, action2], signer);

    expect(signer.signAction).not.toHaveBeenCalled();
    expect(results[0]).toBe(action1);
    expect(results[1]).toBe(action2);
  });

  it("should pass abort signal to signer for unsigned actions", async () => {
    const action: Action = createTestAction();
    const signer = createMockSigner();
    const abortController = new AbortController();

    await signActions([action], signer, abortController.signal);

    expect(signer.signAction).toHaveBeenCalledWith(
      action,
      abortController.signal,
    );
  });
});
