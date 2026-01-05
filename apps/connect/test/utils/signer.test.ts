import {
  ConnectCrypto,
  ConnectCryptoSigner,
  createSignatureVerifier,
  type JsonWebKeyPairStorage,
  type JwkKeyPair,
} from "@renown/sdk";
import type { Action, Operation, Signature } from "document-model";
import { beforeEach, describe, expect, it } from "vitest";

class InMemoryKeyStorage implements JsonWebKeyPairStorage {
  private keyPair: JwkKeyPair | undefined;

  loadKeyPair(): Promise<JwkKeyPair | undefined> {
    return Promise.resolve(this.keyPair);
  }

  saveKeyPair(keyPair: JwkKeyPair): Promise<void> {
    this.keyPair = keyPair;
    return Promise.resolve();
  }
}

describe("ConnectCryptoSigner and Verifier Integration", () => {
  let keyStorage: InMemoryKeyStorage;
  let connectCrypto: ConnectCrypto;
  let signer: ConnectCryptoSigner;
  let verifier: ReturnType<typeof createSignatureVerifier>;

  beforeEach(async () => {
    keyStorage = new InMemoryKeyStorage();
    connectCrypto = new ConnectCrypto(keyStorage);
    signer = new ConnectCryptoSigner(connectCrypto);
    verifier = createSignatureVerifier();
    await connectCrypto.did();
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

  it("verifies a signature created by ConnectCryptoSigner", async () => {
    const did = await connectCrypto.did();

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
    const did = await connectCrypto.did();

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
    const did = await connectCrypto.did();

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
    const did = await connectCrypto.did();

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
    const did = await connectCrypto.did();

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
    const did = await connectCrypto.did();

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
    const did1 = await connectCrypto.did();

    const action: Action = {
      id: "action-1",
      type: "TEST_ACTION",
      timestampUtcMs: new Date().toISOString(),
      input: { foo: "bar" },
      scope: "global",
    };

    const signature = await signer.signAction(action);

    const newKeyStorage = new InMemoryKeyStorage();
    const newConnectCrypto = new ConnectCrypto(newKeyStorage);
    const did2 = await newConnectCrypto.did();

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
