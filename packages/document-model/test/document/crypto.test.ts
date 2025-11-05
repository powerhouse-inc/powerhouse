import type {
  Action,
  ActionSigner,
  PHDocument,
  Reducer,
  ReducerOptions,
  SignalDispatch,
  SigningParameters,
} from "document-model";
import {
  PublicKeySigner,
  ab2hex,
  actionSigner,
  baseCreateDocument,
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  buildSignedAction,
  generateUUIDBrowser,
  hashBrowser,
  hashDocumentStateForScope,
  hex2ab,
  sign,
  verify,
  verifyOperationSignature,
} from "document-model/core";
import type { CountPHState } from "document-model/test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  countReducer,
  createCountDocumentState,
  createCountState,
  increment,
} from "../helpers.js";

/**
 * A signer that uses a key pair to sign and verify data.
 */
class KeyPairSigner extends PublicKeySigner {
  readonly #privateKey: JsonWebKey;

  #privateCryptoKey: CryptoKey | undefined;

  constructor(publicKey: JsonWebKey, privateKey: JsonWebKey) {
    super(publicKey);

    this.#privateKey = privateKey;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const subtleCrypto = await this.subtleCrypto;
    if (!this.#privateCryptoKey) {
      this.#privateCryptoKey = await subtleCrypto.importKey(
        "jwk",
        this.#privateKey,
        {
          name: "Ed25519",
          namedCurve: "Ed25519",
        },
        true,
        ["sign"],
      );
    }

    const arrayBuffer = await subtleCrypto.sign(
      "Ed25519",
      this.#privateCryptoKey,
      data.buffer as ArrayBuffer,
    );

    return new Uint8Array(arrayBuffer);
  }
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

    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );
    document.header.id = "1";

    const action = increment();
    const reducer = ((
      document: PHDocument<CountPHState>,
      action: Action,
      dispatch?: SignalDispatch,
      options?: ReducerOptions,
    ) => {
      const documentWithOp = countReducer(document, action);

      // overwrite last operation id
      documentWithOp.operations.global!.at(-1)!.id = "123";

      return documentWithOp;
    }) as Reducer<CountPHState>;

    const operation = await buildSignedAction(
      action,
      reducer,
      document,
      actionSigner(
        { address: "0x123", chainId: 1, networkId: "1" },
        { name: "test", key: publicKey },
      ),
      async (data) =>
        new Uint8Array(
          await crypto.subtle.sign(
            algorithm,
            keyPair.privateKey,
            data.buffer as ArrayBuffer,
          ),
        ),
    );
    expect(operation.action?.context?.signer).toStrictEqual({
      app: {
        key: publicKey,
        name: "test",
      },
      signatures: [
        [
          "1704067200",
          publicKey,
          "Sa/gjYf8KKaEfUhOuPk9wDzLSns=",
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

    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );

    const operation = await buildSignedAction(
      { ...increment() /*, id: "123"*/ },
      countReducer as Reducer<CountPHState>,
      document,
      actionSigner(
        { address: "0x123", chainId: 1, networkId: "1" },
        { name: "test", key: publicKey },
      ),
      async (data) =>
        new Uint8Array(
          await crypto.subtle.sign(
            algorithm,
            keyPair.privateKey,
            data.buffer as ArrayBuffer,
          ),
        ),
    );
    const signer = operation.action.context!.signer!;
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
        return crypto.subtle.verify(
          algorithm,
          importedKey,
          new Uint8Array(signature),
          new Uint8Array(data),
        );
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

    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );
    document.header.id = "1";

    const operation = await buildSignedAction(
      { ...increment() /*, id: "123"*/ },
      countReducer as Reducer<CountPHState>,
      document,
      actionSigner(
        { address: "0x123", chainId: 1, networkId: "1" },
        { name: "test", key: publicKey },
      ),
      async (data) =>
        new Uint8Array(
          await crypto.subtle.sign(
            algorithm,
            keyPair.privateKey,
            data.buffer as ArrayBuffer,
          ),
        ),
    );
    const signer = operation.action.context!.signer!;
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
        return crypto.subtle.verify(
          algorithm,
          importedKey,
          new Uint8Array(signature),
          new Uint8Array(data),
        );
      },
    );
    expect(verified).toBe(false);
  });

  it("should sign and verify id", async () => {
    const parameters: SigningParameters = {
      documentType: "powerhouse/counter",
      createdAtUtcIso: new Date().toISOString(),
      nonce: generateUUIDBrowser(),
    };

    const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]);

    const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    const signer = new KeyPairSigner(publicKey, privateKey);
    const signature = await sign(parameters, signer);

    await verify(parameters, signature, signer);
  });
});

describe("hashBrowser", () => {
  const testString = "Hello, World!";
  const testUint8Array = new TextEncoder().encode(testString);

  const sha1HelloWorldBase64Hash = "CgqfKmdylCVXq1NV12r0Qvj2XgE=";
  const sha1HelloWorldHexHash = "0a0a9f2a6772942557ab5355d76af442f8f65e01";
  const sha1EmptyStringBase64Hash = "2jmj7l5rSw0yVb/vlWAYkK/YBwk=";
  const sha1EmptyStringHexHash = "da39a3ee5e6b4b0d3255bfef95601890afd80709";

  const blake2bHelloWorldBase64Hash = "ff24iK9x6uDmprdR6ONBPXZ+9PpSp5k9qp7wl/eqPZSRmcETyqN8lPgM87IvfZ1uT13vT/kngwz/5IV8NL49iQ==";
  const blake2bHelloWorldHexHash = "7dfdb888af71eae0e6a6b751e8e3413d767ef4fa52a7993daa9ef097f7aa3d949199c113caa37c94f80cf3b22f7d9d6e4f5def4ff927830cffe4857c34be3d89";
  const blake2bEmptyStringBase64Hash = "eGoC90IBWQPGxv2FJVLScpEvR0DhWEdhiobiF/cfVBnSXhAxr+5YUxOJZESTTrBLkDpoWxRIt1XVb3Aa/pvizg==";
  const blake2bEmptyStringHexHash = "786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce";

  const blake3HelloWorldBase64Hash = "KIqGp58go9bczcp3E76u0Xh5gpa9+nkT+ipi2XJ7+Pg=";
  const blake3HelloWorldHexHash = "288a86a79f20a3d6dccdca7713beaed178798296bdfa7913fa2a62d9727bf8f8";
  const blake3EmptyStringBase64Hash = "rxNJufX5oaagQE3qNtzJSZvLJcmtwRK3zJqTyuQfMmI=";
  const blake3EmptyStringHexHash = "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262";

  describe("SHA1 algorithm", () => {
    it("should hash string with default algorithm (sha1) and default encoding (base64)", () => {
      const result = hashBrowser(testString);
      expect(result).toBe(sha1HelloWorldBase64Hash);
    });

    it("should hash string with sha1 algorithm and base64 encoding", () => {
      const result = hashBrowser(testString, "sha1", "base64");
      expect(result).toBe(sha1HelloWorldBase64Hash);
    });

    it("should hash string with sha1 algorithm and hex encoding", () => {
      const result = hashBrowser(testString, "sha1", "hex");
      expect(result).toBe(sha1HelloWorldHexHash);
    });

    it("should hash Uint8Array with sha1 algorithm and base64 encoding", () => {
      const result = hashBrowser(testUint8Array, "sha1", "base64");
      expect(result).toBe(sha1HelloWorldBase64Hash);
    });

    it("should hash Uint8Array with sha1 algorithm and hex encoding", () => {
      const result = hashBrowser(testUint8Array, "sha1", "hex");
      expect(result).toBe(sha1HelloWorldHexHash);
    });

    it("should hash empty string with sha1", () => {
      const resultBase64 = hashBrowser("", "sha1", "base64");
      const resultHex = hashBrowser("", "sha1", "hex");

      expect(resultBase64).toBe(sha1EmptyStringBase64Hash);
      expect(resultHex).toBe(sha1EmptyStringHexHash);
    });
  });

  describe("SHA1 WASM algorithm", () => {
    it("should hash string with sha1_wasm algorithm and base64 encoding", () => {
      const result = hashBrowser(testString, "sha1_wasm", "base64");
      // Should produce same result as sha1
      expect(result).toBe(sha1HelloWorldBase64Hash);
    });

    it("should hash string with sha1_wasm algorithm and hex encoding", () => {
      const result = hashBrowser(testString, "sha1_wasm", "hex");
      expect(result).toBe(sha1HelloWorldHexHash);
    });

    it("should hash Uint8Array with sha1_wasm algorithm", () => {
      const result = hashBrowser(testUint8Array, "sha1_wasm", "base64");
      expect(result).toBe(sha1HelloWorldBase64Hash);
    });

    it("should hash empty string with sha1_wasm", () => {
      const resultBase64 = hashBrowser("", "sha1_wasm", "base64");
      const resultHex = hashBrowser("", "sha1_wasm", "hex");

      expect(resultBase64).toBe(sha1EmptyStringBase64Hash);
      expect(resultHex).toBe(sha1EmptyStringHexHash);
    });
  });

  describe("BLAKE2b WASM algorithm", () => {
    it("should hash string with blake2b_wasm algorithm and base64 encoding", () => {
      const result = hashBrowser(testString, "blake2b_wasm", "base64");
      // Known BLAKE2b hash of "Hello, World!" in base64 (64 bytes output)
      expect(result).toBe(blake2bHelloWorldBase64Hash);
    });

    it("should hash string with blake2b_wasm algorithm and hex encoding", () => {
      const result = hashBrowser(testString, "blake2b_wasm", "hex");
      // Known BLAKE2b hash of "Hello, World!" in hex (64 bytes output)
      expect(result).toBe(blake2bHelloWorldHexHash);
    });

    it("should hash Uint8Array with blake2b_wasm algorithm", () => {
      const result = hashBrowser(testUint8Array, "blake2b_wasm", "base64");
      expect(result).toBe(blake2bHelloWorldBase64Hash);
    });

    it("should hash empty string with blake2b_wasm", () => {
      const resultBase64 = hashBrowser("", "blake2b_wasm", "base64");
      const resultHex = hashBrowser("", "blake2b_wasm", "hex");

      expect(resultBase64).toBe(blake2bEmptyStringBase64Hash);
      expect(resultHex).toBe(blake2bEmptyStringHexHash);
    });
  });

  describe("BLAKE3 WASM algorithm", () => {
    it("should hash string with blake3_wasm algorithm and base64 encoding", () => {
      const result = hashBrowser(testString, "blake3_wasm", "base64");
      // Known BLAKE3 hash of "Hello, World!" in base64
      expect(result).toBe(blake3HelloWorldBase64Hash);
    });

    it("should hash string with blake3_wasm algorithm and hex encoding", () => {
      const result = hashBrowser(testString, "blake3_wasm", "hex");
      // Known BLAKE3 hash of "Hello, World!" in hex
      expect(result).toBe(blake3HelloWorldHexHash);
    });

    it("should hash Uint8Array with blake3_wasm algorithm", () => {
      const result = hashBrowser(testUint8Array, "blake3_wasm", "base64");
      expect(result).toBe(blake3HelloWorldBase64Hash);
    });

    it("should hash empty string with blake3_wasm", () => {
      const resultBase64 = hashBrowser("", "blake3_wasm", "base64");
      const resultHex = hashBrowser("", "blake3_wasm", "hex");

      expect(resultBase64).toBe(blake3EmptyStringBase64Hash);
      expect(resultHex).toBe(blake3EmptyStringHexHash);
    });
  });

  describe("FarmHash algorithm", () => {
    // FarmHash produces 64-bit hashes (8 bytes)
    const farmhashHelloWorldBase64Hash = "naDhy/rqKEI=";
    const farmhashHelloWorldHexHash = "9da0e1cbfaea2842";
    const farmhashEmptyStringBase64Hash = "muFqOy+QQE8=";
    const farmhashEmptyStringHexHash = "9ae16a3b2f90404f";

    it("should hash string with farmhash algorithm and base64 encoding", () => {
      const result = hashBrowser(testString, "farmhash", "base64");
      expect(result).toBe(farmhashHelloWorldBase64Hash);
    });

    it("should hash string with farmhash algorithm and hex encoding", () => {
      const result = hashBrowser(testString, "farmhash", "hex");
      expect(result).toBe(farmhashHelloWorldHexHash);
    });

    it("should hash Uint8Array with farmhash algorithm", () => {
      const result = hashBrowser(testUint8Array, "farmhash", "base64");
      expect(result).toBe(farmhashHelloWorldBase64Hash);
    });

    it("should hash empty string with farmhash", () => {
      const resultBase64 = hashBrowser("", "farmhash", "base64");
      const resultHex = hashBrowser("", "farmhash", "hex");

      expect(resultBase64).toBe(farmhashEmptyStringBase64Hash);
      expect(resultHex).toBe(farmhashEmptyStringHexHash);
    });

    it("should produce consistent hashes for farmhash", () => {
      const result1 = hashBrowser(testString, "farmhash", "base64");
      const result2 = hashBrowser(testString, "farmhash", "base64");
      expect(result1).toBe(result2);
      expect(result1).toBe(farmhashHelloWorldBase64Hash);
    });

    it("should handle different input strings with farmhash", () => {
      const input1 = "test1";
      const input2 = "test2";
      const hash1 = hashBrowser(input1, "farmhash", "hex");
      const hash2 = hashBrowser(input2, "farmhash", "hex");
      
      // Different inputs should produce different hashes
      expect(hash1).not.toBe(hash2);
      // Both should be 16 hex characters (64 bits = 8 bytes)
      expect(hash1).toMatch(/^[0-9a-f]{16}$/);
      expect(hash2).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should handle special characters with farmhash", () => {
      const specialString = "Hello, 世界! 🌍";
      const result = hashBrowser(specialString, "farmhash", "hex");
      expect(result).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should handle binary data with farmhash", () => {
      const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
      const result = hashBrowser(binaryData, "farmhash", "hex");
      expect(result).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("HighwayHash algorithm", () => {
    // HighwayHash produces 64-bit hashes (8 bytes) by default
    const highwayhashHelloWorldBase64Hash = "0nFK3A1UjeY=";
    const highwayhashHelloWorldHexHash = "d2714adc0d548de6";
    const highwayhashEmptyStringBase64Hash = "SV9C8I7omVg=";
    const highwayhashEmptyStringHexHash = "495f42f08ee89958";

    it("should hash string with highwayhash algorithm and base64 encoding", () => {
      const result = hashBrowser(testString, "highwayhash", "base64");
      expect(result).toBe(highwayhashHelloWorldBase64Hash);
    });

    it("should hash string with highwayhash algorithm and hex encoding", () => {
      const result = hashBrowser(testString, "highwayhash", "hex");
      expect(result).toBe(highwayhashHelloWorldHexHash);
    });

    it("should hash Uint8Array with highwayhash algorithm", () => {
      const result = hashBrowser(testUint8Array, "highwayhash", "base64");
      expect(result).toBe(highwayhashHelloWorldBase64Hash);
    });

    it("should hash empty string with highwayhash", () => {
      const resultBase64 = hashBrowser("", "highwayhash", "base64");
      const resultHex = hashBrowser("", "highwayhash", "hex");

      expect(resultBase64).toBe(highwayhashEmptyStringBase64Hash);
      expect(resultHex).toBe(highwayhashEmptyStringHexHash);
    });

    it("should produce consistent hashes for highwayhash", () => {
      const result1 = hashBrowser(testString, "highwayhash", "base64");
      const result2 = hashBrowser(testString, "highwayhash", "base64");
      expect(result1).toBe(result2);
      expect(result1).toBe(highwayhashHelloWorldBase64Hash);
    });

    it("should handle different input strings with highwayhash", () => {
      const input1 = "test1";
      const input2 = "test2";
      const hash1 = hashBrowser(input1, "highwayhash", "hex");
      const hash2 = hashBrowser(input2, "highwayhash", "hex");
      
      // Different inputs should produce different hashes
      expect(hash1).not.toBe(hash2);
      // Both should be 16 hex characters (64 bits = 8 bytes)
      expect(hash1).toMatch(/^[0-9a-f]{16}$/);
      expect(hash2).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should handle special characters with highwayhash", () => {
      const specialString = "Hello, 世界! 🌍";
      const result = hashBrowser(specialString, "highwayhash", "hex");
      expect(result).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should handle binary data with highwayhash", () => {
      const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
      const result = hashBrowser(binaryData, "highwayhash", "hex");
      expect(result).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should handle very long strings with highwayhash", () => {
      const longString = "a".repeat(10000);
      const result = hashBrowser(longString, "highwayhash", "hex");
      expect(result).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("Different input types", () => {
    it("should handle ArrayBuffer view (Uint16Array)", () => {
      const uint16Array = new Uint16Array([72, 101, 108, 108, 111]); // "Hello" in character codes
      const result = hashBrowser(uint16Array, "sha1", "hex");
      // This should hash the bytes of the Uint16Array
      expect(result).toMatch(/^[0-9a-f]{40}$/);
    });

    it("should handle DataView", () => {
      const buffer = new ArrayBuffer(13);
      const dataView = new DataView(buffer);
      const encoder = new TextEncoder();
      const encoded = encoder.encode(testString);
      encoded.forEach((byte, index) => {
        dataView.setUint8(index, byte);
      });
      
      const result = hashBrowser(dataView, "sha1", "base64");
      expect(result).toBe(sha1HelloWorldBase64Hash);
    });
  });

  describe("Error handling", () => {
    it("should throw error for unsupported algorithm", () => {
      expect(() => {
        hashBrowser(testString, "md5", "base64");
      }).toThrow('Hashing algorithm not supported: "md5"');
    });

    it("should throw error for unsupported encoding", () => {
      expect(() => {
        hashBrowser(testString, "sha1", "base32");
      }).toThrow('Hash encoding not supported: "base32"');
    });
  });

  describe("Consistency across multiple calls", () => {
    it("should produce consistent hashes for same input", () => {
      const result1 = hashBrowser(testString, "sha1", "base64");
      const result2 = hashBrowser(testString, "sha1", "base64");
      expect(result1).toBe(result2);
    });

    it("should produce consistent hashes across all algorithms", () => {
      const sha1Result1 = hashBrowser(testString, "sha1", "hex");
      const sha1Result2 = hashBrowser(testString, "sha1", "hex");
      
      const sha1WasmResult1 = hashBrowser(testString, "sha1_wasm", "hex");
      const sha1WasmResult2 = hashBrowser(testString, "sha1_wasm", "hex");
      
      const blake2bResult1 = hashBrowser(testString, "blake2b_wasm", "hex");
      const blake2bResult2 = hashBrowser(testString, "blake2b_wasm", "hex");
      
      const blake3Result1 = hashBrowser(testString, "blake3_wasm", "hex");
      const blake3Result2 = hashBrowser(testString, "blake3_wasm", "hex");
      
      const farmhashResult1 = hashBrowser(testString, "farmhash", "hex");
      const farmhashResult2 = hashBrowser(testString, "farmhash", "hex");
      
      const highwayhashResult1 = hashBrowser(testString, "highwayhash", "hex");
      const highwayhashResult2 = hashBrowser(testString, "highwayhash", "hex");
      
      expect(sha1Result1).toBe(sha1Result2);
      expect(sha1WasmResult1).toBe(sha1WasmResult2);
      expect(blake2bResult1).toBe(blake2bResult2);
      expect(blake3Result1).toBe(blake3Result2);
      expect(farmhashResult1).toBe(farmhashResult2);
      expect(highwayhashResult1).toBe(highwayhashResult2);
    });

    it("should produce same result for sha1 and sha1_wasm", () => {
      const sha1Result = hashBrowser(testString, "sha1", "base64");
      const sha1WasmResult = hashBrowser(testString, "sha1_wasm", "base64");
      expect(sha1Result).toBe(sha1WasmResult);
    });

    it("should produce same result for default, sha1, and sha1_wasm", () => {
      const defaultResult = hashBrowser(testString);
      const sha1Result = hashBrowser(testString, "sha1", "base64");
      const sha1WasmResult = hashBrowser(testString, "sha1_wasm", "base64");
      
      expect(defaultResult).toBe(sha1Result);
      expect(defaultResult).toBe(sha1WasmResult);
      expect(sha1Result).toBe(sha1WasmResult);
      
      // All should be the known SHA1 hash
      expect(defaultResult).toBe(sha1HelloWorldBase64Hash);
    });
  });

  describe("Edge cases", () => {
    it("should handle very long strings", () => {
      const longString = "a".repeat(10000);
      const result = hashBrowser(longString, "sha1", "hex");
      expect(result).toMatch(/^[0-9a-f]{40}$/);
      expect(result).toBe("a080cbda64850abb7b7f67ee875ba068074ff6fe");
    });

    it("should handle special characters", () => {
      const specialString = "Hello, 世界! 🌍";
      const result = hashBrowser(specialString, "sha1", "hex");
      expect(result).toMatch(/^[0-9a-f]{40}$/);
    });

    it("should handle binary data", () => {
      const binaryData = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
      const result = hashBrowser(binaryData, "sha1", "hex");
      expect(result).toMatch(/^[0-9a-f]{40}$/);
      expect(result).toBe("0522b606c40c0a31c98311e2ac0b526ef157932c");
    });
  });
});
