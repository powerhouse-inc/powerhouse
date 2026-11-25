import type {
  Action,
  ActionSigner,
  ActionSigningTarget,
  ISigner,
  Signature,
  SigningParameters,
} from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  generateId,
  hashDocumentStateForScope,
  sign,
  verify,
} from "@powerhousedao/shared/document-model";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  countReducer,
  createCountDocumentState,
  createCountState,
  increment,
  type CountPHState,
} from "../helpers.js";

/**
 * Creates a test signer using ECDSA P-256 that can sign and verify data.
 */
async function createTestSigner(): Promise<ISigner> {
  const algorithm = { name: "ECDSA", namedCurve: "P-256" };
  const keyPair = await crypto.subtle.generateKey(algorithm, true, [
    "sign",
    "verify",
  ]);

  return {
    publicKey: keyPair.publicKey,

    async sign(data: Uint8Array): Promise<Uint8Array> {
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.privateKey,
        data.buffer as ArrayBuffer,
      );
      return new Uint8Array(signature);
    },

    async verify(data: Uint8Array, signature: Uint8Array): Promise<void> {
      const isValid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        keyPair.publicKey,
        signature.buffer as ArrayBuffer,
        data.buffer as ArrayBuffer,
      );
      if (!isValid) {
        throw new Error("invalid signature");
      }
    },

    async signAction(
      _action: Action,
      _target: ActionSigningTarget,
      _abortSignal?: AbortSignal,
    ): Promise<Signature> {
      await Promise.resolve();
      throw new Error("signAction not implemented in test signer");
    },
  };
}

describe("Crypto utils", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2024-01-01"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("should build signature with empty previousState", () => {
    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );

    const action = increment();
    const documentWithOp = countReducer(document, action);
    const operation = documentWithOp.operations.global![0];

    // overwrite id
    operation.id = "4871aa5f-a53d-4d1c-b5dd-baef4fb17bc2";

    const signer: ActionSigner = {
      user: { address: "0x123", chainId: 1, networkId: "1" },
      app: { name: "test", key: "0xtest" },
      signatures: [],
    };
    const params = buildOperationSignatureParams({
      documentId: "1",
      action: operation.action,
      signer,
      previousStateHash: "",
    });
    expect(params).toStrictEqual([
      "1704067200",
      "0xtest",
      "Sa/gjYf8KKaEfUhOuPk9wDzLSns=",
      "",
    ]);

    const textEncoder = new TextEncoder();
    expect(buildOperationSignatureMessage(params)).toStrictEqual(
      textEncoder.encode(
        "\x19Signed Operation:\n4417040672000xtestSa/gjYf8KKaEfUhOuPk9wDzLSns=",
      ),
    );
  });

  it("should build signature with previousState", () => {
    let document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );

    document = countReducer(document, increment());
    const hash = hashDocumentStateForScope(document, "global");

    const action = increment();
    const documentWithOp = countReducer(document, action);
    const operation = documentWithOp.operations.global![1];

    // overwrite id
    operation.id = "4871aa5f-a53d-4d1c-b5dd-baef4fb17bc2";

    const signer: ActionSigner = {
      user: { address: "0x123", chainId: 1, networkId: "1" },
      app: { name: "test", key: "0xtest" },
      signatures: [],
    };
    const params = buildOperationSignatureParams({
      documentId: "1",
      action: operation.action,
      signer,
      previousStateHash: hash,
    });
    expect(params).toStrictEqual([
      "1704067200",
      "0xtest",
      "Sa/gjYf8KKaEfUhOuPk9wDzLSns=",
      "qA97yBec1rrOyf2eVsYdWwFPOso=",
    ]);

    const textEncoder = new TextEncoder();
    expect(buildOperationSignatureMessage(params)).toStrictEqual(
      textEncoder.encode(
        "\x19Signed Operation:\n7217040672000xtestSa/gjYf8KKaEfUhOuPk9wDzLSns=qA97yBec1rrOyf2eVsYdWwFPOso=",
      ),
    );
  });

  it("should sign and verify id", async () => {
    const parameters: SigningParameters = {
      documentType: "powerhouse/counter",
      createdAtUtcIso: new Date().toISOString(),
      nonce: generateId(),
    };

    const signer = await createTestSigner();
    const signature = await sign(parameters, signer);

    await verify(parameters, signature, signer);
  });
});
