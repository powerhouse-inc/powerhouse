import {
  MemoryKeyStorage,
  RenownBuilder,
  RenownCryptoBuilder,
  createSignatureVerifier,
  type IRenown,
  type IRenownCrypto,
} from "@renown/sdk/node";
import type { Action, ISigner, Operation, Signature } from "document-model";
import { deriveOperationId } from "document-model/core";
import { beforeEach, describe, expect, it } from "vitest";

const TEST_DOC_ID = "test-doc-id";
const TEST_BRANCH = "main";
const TEST_SCOPE = "global";

describe("RenownCryptoSigner and Verifier Integration", () => {
  let keyStorage: MemoryKeyStorage;
  let renownCrypto: IRenownCrypto;
  let renown: IRenown;
  let signer: ISigner;
  let verifier: ReturnType<typeof createSignatureVerifier>;

  beforeEach(async () => {
    keyStorage = new MemoryKeyStorage();
    renownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(keyStorage)
      .build();
    renown = await new RenownBuilder("test-app")
      .withCrypto(renownCrypto)
      .build();
    signer = renown.signer;
    verifier = createSignatureVerifier();
  });

  it("signs an action and produces a valid signature format", async () => {
    const action: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { foo: "bar" },
      scope: "global",
    };

    const signature = await signer.signAction(action);

    expect(signature).toHaveLength(5);
    const [timestamp, signerKey, hash, prevStateHash, signatureHex] = signature;

    expect(timestamp).toMatch(/^\d+$/);
    expect(signerKey.startsWith("did:key:z")).toBe(true);
    expect(hash).toBeDefined();
    expect(prevStateHash).toBe("");
    expect(signatureHex.startsWith("0x")).toBe(true);
    expect(signatureHex.length).toBeGreaterThan(2);
  });

  it("verifies a signature created by RenownCryptoSigner", async () => {
    const did = renownCrypto.did;

    const action: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { foo: "bar" },
      scope: "global",
    };

    const signature = await signer.signAction(action);

    const signedAction: Action = {
      ...action,
      context: {
        signer: {
          user: { address: did, chainId: 1, networkId: "eip155" },
          app: { name: "test-app", key: did },
          signatures: [signature],
        },
      },
    };

    const operation: Operation = {
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

    const isValid = await verifier(operation, did);
    expect(isValid).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const did = renownCrypto.did;

    const action: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { foo: "bar" },
      scope: "global",
    };

    const signature = await signer.signAction(action);
    const [timestamp, signerKey, hash, prevStateHash] = signature;
    const tamperedSignature: Signature = [
      timestamp,
      signerKey,
      hash,
      prevStateHash,
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    ];

    const signedAction: Action = {
      ...action,
      context: {
        signer: {
          user: { address: did, chainId: 1, networkId: "eip155" },
          app: { name: "test-app", key: did },
          signatures: [tamperedSignature],
        },
      },
    };

    const operation: Operation = {
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

    const isValid = await verifier(operation, did);
    expect(isValid).toBe(false);
  });

  it("rejects verification when public key does not match", async () => {
    const did = renownCrypto.did;

    const action: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { foo: "bar" },
      scope: "global",
    };

    const signature = await signer.signAction(action);

    const signedAction: Action = {
      ...action,
      context: {
        signer: {
          user: { address: did, chainId: 1, networkId: "eip155" },
          app: { name: "test-app", key: did },
          signatures: [signature],
        },
      },
    };

    const operation: Operation = {
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

    const wrongDid =
      "did:key:zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169";
    const isValid = await verifier(operation, wrongDid);
    expect(isValid).toBe(false);
  });

  it("returns true for operations without signer context", async () => {
    const action: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { foo: "bar" },
      scope: "global",
    };

    const operation: Operation = {
      id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, action.id),
      index: 0,
      timestampUtcMs: action.timestampUtcMs,
      hash: "",
      skip: 0,
      action: action,
    };

    const isValid = await verifier(operation, "any-key");
    expect(isValid).toBe(true);
  });

  it("returns false for operations with signer but no signatures", async () => {
    const did = renownCrypto.did;

    const action: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { foo: "bar" },
      scope: "global",
      context: {
        signer: {
          user: { address: did, chainId: 1, networkId: "eip155" },
          app: { name: "test-app", key: did },
          signatures: [],
        },
      },
    };

    const operation: Operation = {
      id: deriveOperationId(TEST_DOC_ID, TEST_SCOPE, TEST_BRANCH, action.id),
      index: 0,
      timestampUtcMs: action.timestampUtcMs,
      hash: "",
      skip: 0,
      action: action,
    };

    const isValid = await verifier(operation, did);
    expect(isValid).toBe(false);
  });

  it("handles actions with prevOpHash in context", async () => {
    const did = renownCrypto.did;

    const action: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { foo: "bar" },
      scope: "global",
      context: {
        prevOpHash: "abc123",
      },
    };

    const signature = await signer.signAction(action);

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

    const operation: Operation = {
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

    const isValid = await verifier(operation, did);
    expect(isValid).toBe(true);

    expect(signature[3]).toBe("abc123");
  });

  it("handles complex action inputs", async () => {
    const did = renownCrypto.did;

    const action: Action = {
      id: "action-1",
      type: "COMPLEX_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: {
        nested: {
          deeply: {
            value: [1, 2, 3],
            unicode: "\u00e9\u00e0\u00f9",
          },
        },
        array: ["a", "b", "c"],
        nullValue: null,
        booleans: { yes: true, no: false },
      },
      scope: "document",
    };

    const signature = await signer.signAction(action);

    const signedAction: Action = {
      ...action,
      context: {
        signer: {
          user: { address: did, chainId: 1, networkId: "eip155" },
          app: { name: "test-app", key: did },
          signatures: [signature],
        },
      },
    };

    const operation: Operation = {
      id: deriveOperationId(
        TEST_DOC_ID,
        "document",
        TEST_BRANCH,
        signedAction.id,
      ),
      index: 0,
      timestampUtcMs: action.timestampUtcMs,
      hash: "",
      skip: 0,
      action: signedAction,
    };

    const isValid = await verifier(operation, did);
    expect(isValid).toBe(true);
  });

  it("produces different signatures for different actions", async () => {
    const action1: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { value: 1 },
      scope: "global",
    };

    const action2: Action = {
      id: "action-2",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { value: 2 },
      scope: "global",
    };

    const signature1 = await signer.signAction(action1);
    const signature2 = await signer.signAction(action2);

    expect(signature1[2]).not.toBe(signature2[2]);
    expect(signature1[4]).not.toBe(signature2[4]);
  });

  it("signatures from different keys fail verification", async () => {
    const did1 = renownCrypto.did;

    const action: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { foo: "bar" },
      scope: "global",
    };

    const signature = await signer.signAction(action);

    const newKeyStorage = new MemoryKeyStorage();
    const newRenownCrypto = await new RenownCryptoBuilder()
      .withKeyPairStorage(newKeyStorage)
      .build();
    const did2 = newRenownCrypto.did;

    expect(did1).not.toBe(did2);

    const signedAction: Action = {
      ...action,
      context: {
        signer: {
          user: { address: did1, chainId: 1, networkId: "eip155" },
          app: { name: "test-app", key: did1 },
          signatures: [signature],
        },
      },
    };

    const operation: Operation = {
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

    const isValidWithOriginalKey = await verifier(operation, did1);
    expect(isValidWithOriginalKey).toBe(true);

    const isValidWithDifferentKey = await verifier(operation, did2);
    expect(isValidWithDifferentKey).toBe(false);
  });
});
