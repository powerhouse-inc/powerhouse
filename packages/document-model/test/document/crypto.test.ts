import {
  baseCreateDocument,
  hashDocumentStateForScope,
} from "@document/utils/base.js";
import {
  ab2hex,
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  buildSignedOperation,
  hex2ab,
  verifyOperationSignature,
} from "@document/utils/crypto.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CountAction, countReducer, increment } from "../helpers.js";

describe("Crypto utils", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2024-01-01"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("should build signature with empty previousState", () => {
    const document = baseCreateDocument({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });

    const action = {
      ...increment(),
      id: "4871aa5f-a53d-4d1c-b5dd-baef4fb17bc2",
    };
    const documentWithOp = countReducer(document, action);
    const operation = documentWithOp.operations.global[0];

    const signer = {
      user: { address: "0x123", chainId: 1, networkId: "1" },
      app: { name: "test", key: "0xtest" },
    };
    const params = buildOperationSignatureParams({
      documentId: "1",
      operation,
      signer,
      previousStateHash: "",
    });
    expect(params).toStrictEqual([
      "1704067200",
      "0xtest",
      "ltP0ii+7eM14VIz0UY/SVrZS2ag=",
      "",
    ]);

    const textEncoder = new TextEncoder();
    expect(buildOperationSignatureMessage(params)).toStrictEqual(
      textEncoder.encode(
        "\x19Signed Operation:\n4417040672000xtestltP0ii+7eM14VIz0UY/SVrZS2ag=",
      ),
    );
  });

  it("should build signature with previousState", () => {
    let document = baseCreateDocument({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });

    document = countReducer(document, increment());
    const hash = hashDocumentStateForScope(document, "global");

    const action = {
      ...increment(),
      id: "4871aa5f-a53d-4d1c-b5dd-baef4fb17bc2",
    };
    const documentWithOp = countReducer(document, action);
    const operation = documentWithOp.operations.global[1];

    const signer = {
      user: { address: "0x123", chainId: 1, networkId: "1" },
      app: { name: "test", key: "0xtest" },
    };
    const params = buildOperationSignatureParams({
      documentId: "1",
      operation,
      signer,
      previousStateHash: hash,
    });
    expect(params).toStrictEqual([
      "1704067200",
      "0xtest",
      "ltP0ii+7eM14VIz0UY/SVrZS2ag=",
      "qA97yBec1rrOyf2eVsYdWwFPOso=",
    ]);

    const textEncoder = new TextEncoder();
    expect(buildOperationSignatureMessage(params)).toStrictEqual(
      textEncoder.encode(
        "\x19Signed Operation:\n7217040672000xtestltP0ii+7eM14VIz0UY/SVrZS2ag=qA97yBec1rrOyf2eVsYdWwFPOso=",
      ),
    );
  });

  it("should build signed operation", async () => {
    const algorithm = {
      name: "ECDSA",
      namedCurve: "P-256",
      hash: "SHA-256",
    };

    const keyPair = await crypto.subtle.generateKey(algorithm, true, [
      "sign",
      "verify",
    ]);
    const publicKeyRaw = await crypto.subtle.exportKey(
      "raw",
      keyPair.publicKey,
    );
    const publicKey = `0x${ab2hex(publicKeyRaw)}`;

    const document = baseCreateDocument({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });

    const operation = await buildSignedOperation(
      { ...increment(), id: "123" } as CountAction,
      countReducer,
      document,
      {
        documentId: "1",
        signer: {
          user: { address: "0x123", chainId: 1, networkId: "1" },
          app: { name: "test", key: publicKey },
        },
      },
      async (data) =>
        new Uint8Array(
          await crypto.subtle.sign(
            algorithm,
            keyPair.privateKey,
            data.buffer as ArrayBuffer,
          ),
        ),
    );
    expect(operation.context?.signer).toStrictEqual({
      app: {
        key: publicKey,
        name: "test",
      },
      signatures: [
        [
          "1704067200",
          publicKey,
          "oshEuhs/lncjvixPlkOSZiq0OxE=",
          "",
          expect.stringMatching(/0x[a-f0-9]{128}/),
        ],
      ],
      user: {
        address: "0x123",
        chainId: 1,
        networkId: "1",
      },
    });
  });

  it("should verify signed operation", async () => {
    const algorithm = {
      name: "ECDSA",
      namedCurve: "P-256",
      hash: "SHA-256",
    };

    const keyPair = await crypto.subtle.generateKey(algorithm, true, [
      "sign",
      "verify",
    ]);
    const publicKeyRaw = await crypto.subtle.exportKey(
      "raw",
      keyPair.publicKey,
    );
    const publicKey = `0x${ab2hex(publicKeyRaw)}`;

    const document = baseCreateDocument({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });

    const operation = await buildSignedOperation(
      { ...increment(), id: "123" } as CountAction,
      countReducer,
      document,
      {
        documentId: "1",
        signer: {
          user: { address: "0x123", chainId: 1, networkId: "1" },
          app: { name: "test", key: publicKey },
        },
      },
      async (data) =>
        new Uint8Array(
          await crypto.subtle.sign(
            algorithm,
            keyPair.privateKey,
            data.buffer as ArrayBuffer,
          ),
        ),
    );
    const signer = operation.context!.signer!;
    const verified = await verifyOperationSignature(
      signer.signatures.at(0)!,
      signer,
      async (publicKey, signature, data) => {
        const importedKey = await crypto.subtle.importKey(
          "raw",
          hex2ab(publicKey),
          algorithm,
          true,
          ["verify"],
        );
        return crypto.subtle.verify(algorithm, importedKey, signature, data);
      },
    );

    expect(verified).toBe(true);
  });

  it("should reject tampered operation signature", async () => {
    const algorithm = {
      name: "ECDSA",
      namedCurve: "P-256",
      hash: "SHA-256",
    };

    const keyPair = await crypto.subtle.generateKey(algorithm, true, [
      "sign",
      "verify",
    ]);
    const publicKeyRaw = await crypto.subtle.exportKey(
      "raw",
      keyPair.publicKey,
    );
    const publicKey = `0x${ab2hex(publicKeyRaw)}`;

    const document = baseCreateDocument({
      documentType: "powerhouse/counter",
      state: { global: { count: 0 }, local: { name: "" } },
    });

    const operation = await buildSignedOperation(
      { ...increment(), id: "123" } as CountAction,
      countReducer,
      document,
      {
        documentId: "1",
        signer: {
          user: { address: "0x123", chainId: 1, networkId: "1" },
          app: { name: "test", key: publicKey },
        },
      },
      async (data) =>
        new Uint8Array(
          await crypto.subtle.sign(
            algorithm,
            keyPair.privateKey,
            data.buffer as ArrayBuffer,
          ),
        ),
    );
    const signer = operation.context!.signer!;
    const signature = signer.signatures.at(0)!;

    signature[4] = "FAKE SIGNATURE";
    const verified = await verifyOperationSignature(
      signature,
      signer,
      async (publicKey, signature, data) => {
        const importedKey = await crypto.subtle.importKey(
          "raw",
          hex2ab(publicKey),
          algorithm,
          true,
          ["verify"],
        );
        return crypto.subtle.verify(algorithm, importedKey, signature, data);
      },
    );
    expect(verified).toBe(false);
  });
});
