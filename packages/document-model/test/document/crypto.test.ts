import type {
  Action,
  ActionSigner,
  ActionSigningContext,
  ISigner,
  PHDocument,
  Reducer,
  ReducerOptions,
  SignalDispatch,
  Signature,
  SigningParameters,
} from "@powerhousedao/shared/document-model";
import {
  ab2hex,
  actionSigner,
  baseCreateDocument,
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  buildSignatureMessageV2,
  buildSignedAction,
  generateId,
  hashDocumentStateForScope,
  hashActionV2,
  hex2ab,
  SIGNATURE_SCHEME_V2,
  sign,
  verify,
  verifyOperationSignature,
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
      _context: ActionSigningContext,
      _abortSignal?: AbortSignal,
    ): Promise<Signature> {
      await Promise.resolve();
      throw new Error("signAction not implemented in test signer");
    },
  };
}

/** SHA-256 of a string, base64-encoded. Test-only, independent of production. */
async function sha256Base64(data: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/**
 * The v2 action-hash preimage, rebuilt from the spec rather than from the
 * production helper: a canonical JSON array of the scheme, document id, scope,
 * type, action id, nonce, timestamp and input (#2894).
 */
function v2Preimage(documentId: string, action: Action): string {
  return JSON.stringify([
    SIGNATURE_SCHEME_V2,
    documentId,
    action.scope,
    action.type,
    action.id,
    action.context?.nonce ?? "",
    action.timestampUtcMs,
    action.input,
  ]);
}

describe("Crypto utils", () => {
  beforeAll(() => {
    vi.useFakeTimers().setSystemTime(new Date("2024-01-01"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("should build signature with empty previousState", async () => {
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
    const params = await buildOperationSignatureParams({
      documentId: "1",
      action: operation.action,
      signer,
      previousStateHash: "",
    });
    // The hash field is the v2 action hash, and the scheme is carried as the
    // fifth param (#2894).
    expect(params).toStrictEqual([
      "1704067200",
      "0xtest",
      await sha256Base64(v2Preimage("1", operation.action)),
      "",
      SIGNATURE_SCHEME_V2,
    ]);

    // The v2 message is the params as a canonical JSON array, length-prefixed.
    const textEncoder = new TextEncoder();
    const expectedMessage = JSON.stringify(params);
    expect(buildSignatureMessageV2(params)).toStrictEqual(
      textEncoder.encode(
        "\x19Signed Operation:\n" + expectedMessage.length + expectedMessage,
      ),
    );
  });

  it("should build signature with previousState", async () => {
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
    const params = await buildOperationSignatureParams({
      documentId: "1",
      action: operation.action,
      signer,
      previousStateHash: hash,
    });
    expect(params).toStrictEqual([
      "1704067200",
      "0xtest",
      await sha256Base64(v2Preimage("1", operation.action)),
      "qA97yBec1rrOyf2eVsYdWwFPOso=",
      SIGNATURE_SCHEME_V2,
    ]);

    const textEncoder = new TextEncoder();
    const expectedMessage = JSON.stringify(params);
    expect(buildSignatureMessageV2(params)).toStrictEqual(
      textEncoder.encode(
        "\x19Signed Operation:\n" + expectedMessage.length + expectedMessage,
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
      _dispatch?: SignalDispatch,
      _options?: ReducerOptions,
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
          await sha256Base64(v2Preimage("1", action)),
          "",
          expect.stringMatching(/0x[a-f0-9]{128}/),
          SIGNATURE_SCHEME_V2,
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
      operation.action,
      document.header.id,
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
      operation.action,
      document.header.id,
    );
    expect(verified).toBe(false);
  });

  it("should reject a signature replayed onto a different document", async () => {
    const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    const keyPair = await crypto.subtle.generateKey(algorithm, true, [
      "sign",
      "verify",
    ]);
    const publicKey = `0x${ab2hex(
      await crypto.subtle.exportKey("raw", keyPair.publicKey),
    )}`;

    const signHandler = async (data: Uint8Array) =>
      new Uint8Array(
        await crypto.subtle.sign(
          algorithm,
          keyPair.privateKey,
          data.buffer as ArrayBuffer,
        ),
      );
    const verifyHandler = async (
      pk: string,
      signature: Uint8Array,
      data: Uint8Array,
    ) => {
      const importedKey = await crypto.subtle.importKey(
        "raw",
        hex2ab(pk),
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
    };

    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );
    document.header.id = "doc-A";

    const operation = await buildSignedAction(
      { ...increment() },
      countReducer as Reducer<CountPHState>,
      document,
      actionSigner(
        { address: "0x123", chainId: 1, networkId: "1" },
        { name: "test", key: publicKey },
      ),
      signHandler,
    );

    const signerInfo = operation.action.context!.signer!;

    // Verifies against the document the signature was made for.
    await expect(
      verifyOperationSignature(
        signerInfo.signatures.at(0)!,
        signerInfo,
        verifyHandler,
        operation.action,
        "doc-A",
      ),
    ).resolves.toBe(true);

    // The same signature replayed against a different document: its hash
    // embeds the original document id, so it must not verify (#2894).
    await expect(
      verifyOperationSignature(
        signerInfo.signatures.at(0)!,
        signerInfo,
        verifyHandler,
        operation.action,
        "doc-B",
      ),
    ).resolves.toBe(false);
  });

  it("should reject a signature reattached to a different input", async () => {
    const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    const keyPair = await crypto.subtle.generateKey(algorithm, true, [
      "sign",
      "verify",
    ]);
    const publicKey = `0x${ab2hex(
      await crypto.subtle.exportKey("raw", keyPair.publicKey),
    )}`;

    const signHandler = async (data: Uint8Array) =>
      new Uint8Array(
        await crypto.subtle.sign(
          algorithm,
          keyPair.privateKey,
          data.buffer as ArrayBuffer,
        ),
      );
    const verifyHandler = async (
      pk: string,
      signature: Uint8Array,
      data: Uint8Array,
    ) => {
      const importedKey = await crypto.subtle.importKey(
        "raw",
        hex2ab(pk),
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
    };

    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );
    document.header.id = "doc-A";

    const operation = await buildSignedAction(
      { ...increment() },
      countReducer as Reducer<CountPHState>,
      document,
      actionSigner(
        { address: "0x123", chainId: 1, networkId: "1" },
        { name: "test", key: publicKey },
      ),
      signHandler,
    );

    const signerInfo = operation.action.context!.signer!;

    // The same signature attached to an action whose input changed must not
    // verify: the hash field must describe the action it is attached to
    // (#2894).
    const replayed: Action = {
      ...operation.action,
      input: { tampered: true },
    };
    await expect(
      verifyOperationSignature(
        signerInfo.signatures.at(0)!,
        signerInfo,
        verifyHandler,
        replayed,
        "doc-A",
      ),
    ).resolves.toBe(false);
  });

  it("should reject a signature reattached to a different type and scope", async () => {
    const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    const keyPair = await crypto.subtle.generateKey(algorithm, true, [
      "sign",
      "verify",
    ]);
    const publicKey = `0x${ab2hex(
      await crypto.subtle.exportKey("raw", keyPair.publicKey),
    )}`;

    const signHandler = async (data: Uint8Array) =>
      new Uint8Array(
        await crypto.subtle.sign(
          algorithm,
          keyPair.privateKey,
          data.buffer as ArrayBuffer,
        ),
      );
    const verifyHandler = async (
      pk: string,
      signature: Uint8Array,
      data: Uint8Array,
    ) => {
      const importedKey = await crypto.subtle.importKey(
        "raw",
        hex2ab(pk),
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
    };

    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );
    document.header.id = "doc-A";

    const operation = await buildSignedAction(
      { ...increment() },
      countReducer as Reducer<CountPHState>,
      document,
      actionSigner(
        { address: "0x123", chainId: 1, networkId: "1" },
        { name: "test", key: publicKey },
      ),
      signHandler,
    );

    const signerInfo = operation.action.context!.signer!;

    const replayed: Action = {
      ...operation.action,
      type: "DECREMENT",
      scope: "local",
    };
    await expect(
      verifyOperationSignature(
        signerInfo.signatures.at(0)!,
        signerInfo,
        verifyHandler,
        replayed,
        "doc-A",
      ),
    ).resolves.toBe(false);
  });

  it("should verify a valid signature with the three-argument form (no action to bind)", async () => {
    const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    const keyPair = await crypto.subtle.generateKey(algorithm, true, [
      "sign",
      "verify",
    ]);
    const publicKey = `0x${ab2hex(
      await crypto.subtle.exportKey("raw", keyPair.publicKey),
    )}`;

    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );
    const operation = await buildSignedAction(
      { ...increment() },
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

    // The historical call shape carries no action, so there is nothing to
    // bind against; the signature verifies as it did before the binding
    // existed.
    const verified = await verifyOperationSignature(
      signer.signatures.at(0)!,
      signer,
      async (pk, signature, data) => {
        const importedKey = await crypto.subtle.importKey(
          "raw",
          hex2ab(pk),
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

  it("should reject a tampered signature with the three-argument form", async () => {
    const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    const keyPair = await crypto.subtle.generateKey(algorithm, true, [
      "sign",
      "verify",
    ]);
    const publicKey = `0x${ab2hex(
      await crypto.subtle.exportKey("raw", keyPair.publicKey),
    )}`;

    const document = baseCreateDocument<CountPHState>(
      createCountDocumentState,
      createCountState(),
    );
    const operation = await buildSignedAction(
      { ...increment() },
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
      async (pk, signature, data) => {
        const importedKey = await crypto.subtle.importKey(
          "raw",
          hex2ab(pk),
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
      nonce: generateId(),
    };

    const signer = await createTestSigner();
    const signature = await sign(parameters, signer);

    await verify(parameters, signature, signer);
  });
});

describe("the legacy signature message", () => {
  it("is the four params concatenated and length-prefixed", () => {
    // Still built for verifying signatures written before the scheme field
    // existed, so its shape has to stay put.
    const params: [string, string, string, string] = [
      "1704067200",
      "0xtest",
      "0xhash",
      "0xprev",
    ];
    const message = "17040672000xtest0xhash0xprev";
    expect(buildOperationSignatureMessage(params)).toStrictEqual(
      new TextEncoder().encode(
        "\x19Signed Operation:\n" + message.length + message,
      ),
    );
  });
});

describe("hashActionV2", () => {
  const baseAction: Action = {
    id: "action-1",
    type: "INCREMENT",
    timestampUtcMs: "2024-01-01T00:00:00.000Z",
    input: { a: 1, b: 2 },
    scope: "global",
  };

  it("does not share a hash between actions differing only in id", async () => {
    // The action id binds the signature to one application of the action:
    // without it the same signed content re-submitted under a fresh id passes
    // the executor's duplicate check and applies again (#2894).
    const other: Action = { ...baseAction, id: "action-2" };
    expect(await hashActionV2("doc-A", baseAction)).not.toBe(
      await hashActionV2("doc-A", other),
    );
  });

  it("does not share a hash between actions differing only in nonce", async () => {
    const withNonce: Action = { ...baseAction, context: { nonce: "n-1" } };
    const withOtherNonce: Action = {
      ...baseAction,
      context: { nonce: "n-2" },
    };
    expect(await hashActionV2("doc-A", withNonce)).not.toBe(
      await hashActionV2("doc-A", withOtherNonce),
    );
    expect(await hashActionV2("doc-A", withNonce)).not.toBe(
      await hashActionV2("doc-A", baseAction),
    );
  });

  it("is stable when the input's key insertion order changes", async () => {
    // Storage round-trips re-serialize the action and do not preserve key
    // order (PGlite's JSONB reorders keys), so the hash must follow the
    // input's content only (#2894).
    const reordered: Action = {
      ...baseAction,
      input: { b: 2, a: 1 },
    };
    expect(Object.keys(reordered.input as object)).toEqual(["b", "a"]);
    expect(await hashActionV2("doc-A", reordered)).toBe(
      await hashActionV2("doc-A", baseAction),
    );
  });

  it("binds the hash to the document", async () => {
    expect(await hashActionV2("doc-A", baseAction)).not.toBe(
      await hashActionV2("doc-B", baseAction),
    );
  });
});
